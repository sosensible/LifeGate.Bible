// Stewardship budget math, money parsing and splits, against a throwaway SQLite database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decimalToCents, formatCents } from '../../shared/money'
import { AVAILABLE_TO_FUND_ID, addMonths, monthEnd } from '../../shared/stewardship'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-budget-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let budget: typeof import('../../server/lib/budget')
let transactions: typeof import('../../server/lib/transactions')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  budget = await import('../../server/lib/budget')
  transactions = await import('../../server/lib/transactions')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const account = (name: string, kind: 'checking' | 'savings' | 'credit', openingBalanceCents = 0) =>
  db.insert(schema.financeAccounts).values({ name, kind, openingBalanceCents }).returning().get().id

const category = (name: string, rollover: boolean) =>
  db.insert(schema.categories).values({ groupId: 'general', name, rollover }).returning().get().id

const spend = (accountId: string, postedOn: string, amountCents: number, categoryId: string | null) =>
  db.transaction(tx => transactions.createManualTransaction(tx, { accountId, postedOn, amountCents, payee: null, memo: null, categoryId }))

const fund = (categoryId: string, month: string, cents: number) =>
  db.transaction(tx => budget.setFunding(tx, categoryId, month, cents))

const row = (view: ReturnType<typeof budget.monthView>, id: string) =>
  view.groups.flatMap(g => g.categories).find(c => c.id === id)!

describe('money', () => {
  it('parses typed and bank amounts to cents without float error', () => {
    expect(decimalToCents('1,234.56')).toBe(123456)
    expect(decimalToCents('$12')).toBe(1200)
    expect(decimalToCents('-3.5')).toBe(-350)
    expect(decimalToCents('0.10')).toBe(10)
    expect(decimalToCents('19.995')).toBe(2000)
    expect(decimalToCents('-19.994')).toBe(-1999)
    expect(decimalToCents('.07')).toBe(7)
    expect(decimalToCents('abc')).toBeNull()
    expect(decimalToCents('')).toBeNull()
    expect(formatCents(-500)).toBe('-$5.00')
  })

  it('steps months across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(monthEnd('2028-02')).toBe('2028-02-29')
  })
})

describe('budget', () => {
  let checking: string
  let savings: string
  let card: string
  let supplies: string
  let utilities: string

  beforeAll(() => {
    checking = account('Checking', 'checking', 100_000)
    savings = account('Savings', 'savings')
    card = account('Church card', 'credit')
    supplies = category('Supplies', true)
    utilities = category('Utilities', false)

    fund(supplies, '2026-01', 30_000)
    fund(utilities, '2026-01', 20_000)
    spend(checking, '2026-01-10', -10_000, supplies)
    spend(checking, '2026-01-20', -25_000, utilities) // overspent by $50
  })

  it('funds categories out of cash and tracks Remaining', () => {
    const jan = budget.monthView('2026-01')
    expect(jan.cashCents).toBe(65_000)
    expect(row(jan, supplies)).toMatchObject({ fundedCents: 30_000, activityCents: -10_000, remainingCents: 20_000 })
    expect(row(jan, utilities)).toMatchObject({ fundedCents: 20_000, activityCents: -25_000, remainingCents: -5_000 })
    // $1,000 opening cash less $500 funded.
    expect(jan.availableToFundCents).toBe(50_000)
  })

  it('rolls over what is left, and returns a reset category’s leftover to Available to Fund', () => {
    const feb = budget.monthView('2026-02')
    expect(row(feb, supplies).remainingCents).toBe(20_000)
    expect(row(feb, utilities)).toMatchObject({ fundedCents: 0, activityCents: 0, remainingCents: 0 })
    // Utilities' $50 overspending came out of Available to Fund.
    expect(feb.availableToFundCents).toBe(45_000)
  })

  it('adds income to Available to Fund and holds uncategorized spending aside', () => {
    spend(checking, '2026-03-01', 40_000, AVAILABLE_TO_FUND_ID)
    spend(checking, '2026-03-05', -1_000, null)
    const mar = budget.monthView('2026-03')
    expect(mar.cashCents).toBe(104_000)
    expect(mar.uncategorizedCents).toBe(-1_000)
    expect(mar.uncategorizedCount).toBe(1)
    expect(mar.availableToFundCents).toBe(85_000)
    // Available to Fund is not a budget row.
    expect(mar.groups.flatMap(g => g.categories).some(c => c.id === AVAILABLE_TO_FUND_ID)).toBe(false)
  })

  it('keeps cash equal to Available to Fund, every Remaining and uncategorized', () => {
    for (const month of ['2026-01', '2026-02', '2026-03', '2026-04']) {
      const view = budget.monthView(month)
      const remaining = view.groups.reduce((sum, g) => sum + g.remainingCents, 0)
      expect(view.availableToFundCents + remaining + view.uncategorizedCents).toBe(view.cashCents)
    }
  })

  it('ignores transfers between cash accounts and spending on non-cash accounts', () => {
    const before = budget.monthView('2026-04')
    const out = spend(checking, '2026-04-02', -5_000, null)
    const into = spend(savings, '2026-04-02', 5_000, null)
    db.transaction((tx) => {
      transactions.updateTransaction(tx, out, { isTransfer: true })
      transactions.updateTransaction(tx, into, { isTransfer: true })
    })
    spend(card, '2026-04-03', -3_000, supplies)

    const after = budget.monthView('2026-04')
    expect(after.cashCents).toBe(before.cashCents)
    expect(after.availableToFundCents).toBe(before.availableToFundCents)
    expect(after.uncategorizedCount).toBe(before.uncategorizedCount)
    expect(row(after, supplies).activityCents).toBe(0)
  })

  it('uses the bank’s balance for bank accounts, less anything posted after the month', () => {
    const mayBefore = budget.cashAtMonthEnd('2026-05')
    const juneBefore = budget.cashAtMonthEnd('2026-06')
    const bank = db.insert(schema.financeAccounts).values({ name: 'Bank', kind: 'checking', source: 'simplefin', externalId: 'acct-1', balanceCents: 50_000 }).returning().get().id
    const later = db.insert(schema.financeTransactions).values({ accountId: bank, externalId: 't-1', postedOn: '2026-06-02', amountCents: -2_000, source: 'simplefin' }).returning().get().id
    db.insert(schema.transactionSplits).values({ transactionId: later, amountCents: -2_000 }).run()

    // Today's $500 balance already reflects the June withdrawal; at the end of May it was $520.
    expect(budget.cashAtMonthEnd('2026-06') - juneBefore).toBe(50_000)
    expect(budget.cashAtMonthEnd('2026-05') - mayBefore).toBe(52_000)
  })

  it('refuses splits that do not add up, and funding Available to Fund', () => {
    const id = spend(checking, '2026-04-10', -9_000, null)
    expect(() => db.transaction(tx => transactions.replaceSplits(tx, id, [
      { categoryId: supplies, amountCents: -4_000, memo: null },
      { categoryId: utilities, amountCents: -4_000, memo: null },
    ]))).toThrow(/add up/)

    db.transaction(tx => transactions.replaceSplits(tx, id, [
      { categoryId: supplies, amountCents: -4_000, memo: null },
      { categoryId: utilities, amountCents: -5_000, memo: null },
    ]))
    const apr = budget.monthView('2026-04')
    expect(row(apr, supplies).activityCents).toBe(-4_000)

    expect(() => fund(AVAILABLE_TO_FUND_ID, '2026-04', 100)).toThrow(/not funded directly/)
  })

  it('will not add hand-entered transactions to a bank account', () => {
    const bank = db.insert(schema.financeAccounts).values({ name: 'Bank 2', kind: 'checking', source: 'simplefin', externalId: 'acct-2' }).returning().get().id
    expect(() => spend(bank, '2026-04-10', -100, null)).toThrow(/come from the bank/)
  })
})
