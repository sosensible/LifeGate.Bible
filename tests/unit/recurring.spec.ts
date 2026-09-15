// Recurring transactions, plans in the budget and funding plans, against a throwaway SQLite database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-recurring-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.CHURCH_TIME_ZONE = 'America/Detroit'

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let recurring: typeof import('../../server/lib/recurring')
let plans: typeof import('../../server/lib/plans')
let budget: typeof import('../../server/lib/budget')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  recurring = await import('../../server/lib/recurring')
  plans = await import('../../server/lib/plans')
  budget = await import('../../server/lib/budget')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const bankTransaction = (accountId: string, externalId: string, postedOn: string, amountCents: number, bankDescription: string) => {
  const id = db.insert(schema.financeTransactions).values({ accountId, externalId, postedOn, amountCents, bankDescription, source: 'simplefin' }).returning().get().id
  db.insert(schema.transactionSplits).values({ transactionId: id, amountCents }).run()
  return id
}

const categoryOf = async (transactionId: string) => {
  const { eq } = await import('drizzle-orm')
  return db.select().from(schema.transactionSplits).where(eq(schema.transactionSplits.transactionId, transactionId)).get()!.categoryId
}

const addRecurring = (values: Partial<typeof import('../../server/database/schema/index').recurringTransactions.$inferInsert>) =>
  db.insert(schema.recurringTransactions).values({
    name: 'Bill',
    amountCents: -18_000,
    frequency: 'monthly',
    anchorOn: '2026-01-05',
    ...values,
  }).returning().get()

describe('matching bank transactions', () => {
  let bank: string
  let utilities: string

  beforeAll(() => {
    bank = db.insert(schema.financeAccounts).values({ name: 'Checking', kind: 'checking', source: 'simplefin', externalId: 'a1', balanceCents: 0 }).returning().get().id
    utilities = db.insert(schema.categories).values({ groupId: 'general', name: 'Utilities' }).returning().get().id
  })

  it('matches within five days and the amount tolerance, once per occurrence', async () => {
    const power = addRecurring({ name: 'Consumers Energy', categoryId: utilities, matchBank: true, amountVaries: true, matchText: 'consumers' })
    const march = bankTransaction(bank, 't1', '2026-03-08', -20_000, 'CONSUMERS ENERGY ACH') // 3 days late, +11%
    const tooFar = bankTransaction(bank, 't2', '2026-03-20', -18_000, 'CONSUMERS ENERGY ACH') // 15 days from any due date
    const tooBig = bankTransaction(bank, 't3', '2026-04-05', -30_000, 'CONSUMERS ENERGY ACH') // +67%
    const wrongText = bankTransaction(bank, 't4', '2026-05-05', -18_000, 'DTE ENERGY')

    const matched = db.transaction(tx => recurring.matchImported(tx, [march, tooFar, tooBig, wrongText]))
    expect(matched).toEqual([march])
    expect(await categoryOf(march)).toBe(utilities)
    expect(await categoryOf(tooFar)).toBeNull()

    // The March occurrence is now paid, so a second March payment does not match it.
    const again = bankTransaction(bank, 't5', '2026-03-06', -18_000, 'CONSUMERS ENERGY ACH')
    expect(db.transaction(tx => recurring.matchImported(tx, [again]))).toEqual([])

    const upcoming = recurring.upcoming('2026-03-01', '2026-04-30', { on: '2026-04-10' })
    expect(upcoming.filter(o => o.recurringId === power.id).map(o => [o.dueOn, o.status])).toEqual([['2026-03-05', 'paid'], ['2026-04-05', 'overdue']])
  })

  it('never matches reminders or skipped occurrences', async () => {
    addRecurring({ name: 'Reminder only', amountCents: -5_000, anchorOn: '2026-06-01' })
    const skipped = addRecurring({ name: 'Water', amountCents: -6_000, anchorOn: '2026-06-10', categoryId: utilities, matchBank: true })
    db.transaction(tx => recurring.skipOccurrence(tx, skipped.id, '2026-06-10'))

    const reminderPayment = bankTransaction(bank, 't6', '2026-06-01', -5_000, 'SOMETHING')
    const waterPayment = bankTransaction(bank, 't7', '2026-06-10', -6_000, 'CITY WATER')
    expect(db.transaction(tx => recurring.matchImported(tx, [reminderPayment, waterPayment]))).toEqual([])
    expect(() => db.transaction(tx => recurring.skipOccurrence(tx, skipped.id, '2026-06-11'))).toThrow(/Nothing is due/)
  })
})

describe('entering automatically', () => {
  it('enters due occurrences in manual accounts only, once, and not before it was set up', async () => {
    const { eq } = await import('drizzle-orm')
    const cashBox = db.insert(schema.financeAccounts).values({ name: 'Cash box', kind: 'cash' }).returning().get().id
    const bank = db.insert(schema.financeAccounts).values({ name: 'Bank', kind: 'checking', source: 'simplefin', externalId: 'b2' }).returning().get().id
    const flowers = db.insert(schema.categories).values({ groupId: 'general', name: 'Flowers' }).returning().get().id

    const weekly = addRecurring({ name: 'Flowers', amountCents: -2_500, frequency: 'weekly', anchorOn: '2026-01-04', accountId: cashBox, categoryId: flowers, autoEnter: true, createdAt: new Date('2026-02-01T12:00:00Z') })
    addRecurring({ name: 'Bank bill', accountId: bank, categoryId: flowers, autoEnter: true, createdAt: new Date('2026-01-01T12:00:00Z') })

    const first = recurring.autoEnterDue('2026-02-20')
    // Sundays from Feb 1 (set up) through Feb 20: Feb 1, 8, 15.
    expect(first).toHaveLength(3)
    expect(recurring.autoEnterDue('2026-02-20')).toHaveLength(0)

    const entered = db.select().from(schema.financeTransactions).where(eq(schema.financeTransactions.accountId, cashBox)).all()
    expect(entered.map(t => t.postedOn).sort()).toEqual(['2026-02-01', '2026-02-08', '2026-02-15'])
    expect(entered[0]).toMatchObject({ amountCents: -2_500, payee: 'Flowers', source: 'manual' })
    expect(db.select().from(schema.financeTransactions).where(eq(schema.financeTransactions.accountId, bank)).all()).toHaveLength(0)
    expect(recurring.upcoming('2026-02-01', '2026-02-28', { on: '2026-02-20' }).filter(o => o.recurringId === weekly.id).map(o => o.status))
      .toEqual(['entered', 'entered', 'entered', 'open'])
  })
})

describe('plans in the budget', () => {
  let insurance: string
  let supplies: string
  let resets: string

  beforeAll(() => {
    db.insert(schema.financeAccounts).values({ name: 'Plans checking', kind: 'checking', openingBalanceCents: 100_000 }).run()
    const group = db.insert(schema.categoryGroups).values({ name: 'Plans' }).returning().get().id
    insurance = db.insert(schema.categories).values({ groupId: group, name: 'Insurance', sortOrder: 0 }).returning().get().id
    supplies = db.insert(schema.categories).values({ groupId: group, name: 'Supplies', sortOrder: 1 }).returning().get().id
    resets = db.insert(schema.categories).values({ groupId: group, name: 'Resets', rollover: false, sortOrder: 2 }).returning().get().id
  })

  const planInput = (overrides: Record<string, unknown>) => ({
    source: 'custom', kind: 'fillUpTo', cadence: 'monthly', amountCents: 0, dueOn: null, deadline: 'byDate', repeat: 'none', startMonth: '2027-01', ...overrides,
  }) as import('../../shared/stewardship').PlanInput

  const row = (month: string, id: string) => budget.monthView(month).groups.flatMap(g => g.categories).find(c => c.id === id)!

  it('shows needed and status on each month’s rows', () => {
    db.transaction((tx) => {
      plans.setPlan(tx, insurance, planInput({ cadence: 'byDate', amountCents: 120_000, dueOn: '2027-06-15', deadline: 'byMonth', repeat: 'yearly' }))
      plans.setPlan(tx, supplies, planInput({ kind: 'add', amountCents: 5_000 }))
    })
    expect(row('2027-01', insurance).plan).toMatchObject({ status: 'underfunded', neededCents: 24_000, dueOn: '2027-06-15', deadline: 'byMonth' })
    expect(row('2027-01', supplies).plan).toMatchObject({ status: 'underfunded', neededCents: 5_000 })
    expect(row('2026-12', supplies).plan?.status).toBe('notStarted')
    expect(budget.monthView('2027-01').neededCents).toBe(29_000)
  })

  it('refuses a dated plan on a category that resets, unless told to switch it', async () => {
    const { eq } = await import('drizzle-orm')
    const dated = planInput({ cadence: 'byDate', amountCents: 10_000, dueOn: '2027-03-01' })
    expect(() => db.transaction(tx => plans.setPlan(tx, resets, dated))).toThrow(/roll over/)
    db.transaction(tx => plans.setPlan(tx, resets, { ...dated, switchToRollover: true }))
    expect(db.select().from(schema.categories).where(eq(schema.categories.id, resets)).get()!.rollover).toBe(true)
    db.transaction(tx => plans.deletePlan(tx, resets))
  })

  it('previews funding without saving, then funds in budget order until Available to Fund runs out', () => {
    const preview = db.transaction(tx => plans.fundPlans(tx, '2027-01', { dryRun: true }))
    expect(preview.lines.map(l => [l.name, l.fundCents])).toEqual([['Insurance', 24_000], ['Supplies', 5_000]])
    expect(row('2027-01', insurance).fundedCents).toBe(0)

    // Put all but $260 of Available to Fund into another category.
    const reserve = db.insert(schema.categories).values({ groupId: 'general', name: 'Reserve' }).returning().get().id
    const available = budget.monthView('2027-01').availableToFundCents
    db.transaction(tx => budget.setFunding(tx, reserve, '2027-01', available - 26_000))

    const funded = db.transaction(tx => plans.fundPlans(tx, '2027-01', { dryRun: false }))
    expect(funded.lines.map(l => [l.name, l.fundCents])).toEqual([['Insurance', 24_000], ['Supplies', 2_000]])
    expect(funded).toMatchObject({ totalCents: 26_000, shortfallCents: 3_000 })
    expect(row('2027-01', insurance)).toMatchObject({ fundedCents: 24_000, plan: { status: 'onTrack', neededCents: 0 } })
    expect(row('2027-01', supplies)).toMatchObject({ fundedCents: 2_000, plan: { status: 'underfunded', neededCents: 3_000 } })
    expect(budget.monthView('2027-01').availableToFundCents).toBe(0)
  })
})
