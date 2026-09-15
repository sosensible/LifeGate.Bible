// Semi-annual reports, against a throwaway SQLite database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-reports-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let budget: typeof import('../../server/lib/budget')
let transactions: typeof import('../../server/lib/transactions')
let giving: typeof import('../../server/lib/giving')
let reports: typeof import('../../server/lib/reports')
let output: typeof import('../../server/lib/report-pdf')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  budget = await import('../../server/lib/budget')
  transactions = await import('../../server/lib/transactions')
  giving = await import('../../server/lib/giving')
  reports = await import('../../server/lib/reports')
  output = await import('../../server/lib/report-pdf')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const FIRST_HALF = { year: 2027, half: 1 as const }

describe('semi-annual report', () => {
  let checking: string
  let youth: string
  let coffee: string
  let benevolence: string
  let report: ReturnType<typeof reports.semiAnnualReport>

  const category = (name: string, rollover: boolean, isSensitive = false) =>
    db.insert(schema.categories).values({ groupId: 'general', name, rollover, isSensitive }).returning().get().id
  const fund = (categoryId: string, month: string, cents: number) => db.transaction(tx => budget.setFunding(tx, categoryId, month, cents))
  const enter = (postedOn: string, amountCents: number, categoryId: string | null, payee: string | null = null, memo: string | null = null) =>
    db.transaction(tx => transactions.createManualTransaction(tx, { accountId: checking, postedOn, amountCents, payee, memo, categoryId }))

  beforeAll(() => {
    const treasurer = db.insert(schema.user).values({ id: crypto.randomUUID(), name: 'T', email: 't@example.org', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }).returning().get().id
    checking = db.insert(schema.financeAccounts).values({ name: 'Checking', kind: 'checking', openingBalanceCents: 100_000 }).returning().get().id
    db.insert(schema.financeAccounts).values({ name: 'Card', kind: 'credit' }).run()
    youth = category('Youth', true)
    coffee = category('Coffee', false)
    benevolence = category('Benevolence', true, true)

    // Before the period: Youth carries $70 into January.
    fund(youth, '2026-12', 10_000)
    enter('2026-12-10', -3_000, youth)

    fund(youth, '2027-01', 5_000)
    enter('2027-01-08', -4_000, youth, 'Pizza')
    fund(coffee, '2027-01', 2_000)
    enter('2027-01-09', -500, coffee)
    fund(coffee, '2027-03', 1_000)
    enter('2027-03-15', -1_200, coffee)
    fund(benevolence, '2027-02', 5_000)
    enter('2027-02-11', -2_000, benevolence, 'Jane Doe', 'Rent help')
    enter('2027-02-20', -1_500, youth, '=HYPERLINK("http://example.com")')
    enter('2027-01-20', 1_000, 'available-to-fund', 'Insurance refund')

    // An offering: $300 undesignated and $50 designated to Youth, recorded in checking.
    db.transaction((tx) => {
      const countId = giving.openCount(tx, { countedOn: '2027-01-03', label: null, expectedCashCents: 35_000, expectedCheckCents: 0, openedByUserId: treasurer })
      giving.addGift(tx, countId, { giverId: null, method: 'cash', checkNumber: null, receivedOn: null, lines: [{ categoryId: null, amountCents: 30_000, memo: null }, { categoryId: youth, amountCents: 5_000, memo: null }] })
      giving.closeCount(tx, countId, treasurer)
      giving.recordDeposit(tx, countId, checking, '2027-01-05')
    })

    // A credit card payment, and a transaction nobody has categorized yet.
    const payment = enter('2027-04-01', -2_500, null, 'Card payment')
    db.transaction(tx => transactions.updateTransaction(tx, payment, { isTransfer: true }))
    enter('2027-05-02', -700, null)

    // After the period.
    enter('2027-07-01', -9_999, youth)

    report = reports.semiAnnualReport(FIRST_HALF, db, '2027-09')
  })

  const row = (id: string) => report.groups.flatMap(g => g.categories).find(c => c.id === id)!

  it('carries in, funds, spends and ends each category the way the budget does', () => {
    expect(row(youth)).toMatchObject({ carriedInCents: 7_000, fundedCents: 5_000, activityCents: -500, returnedCents: 0, remainingCents: 11_500 })
    expect(row(youth).monthlyActivityCents).toEqual([1_000, -1_500, 0, 0, 0, 0])
    expect(row(youth).remainingCents).toBe(budget.monthView('2027-06').groups.flatMap(g => g.categories).find(c => c.id === youth)!.remainingCents)
  })

  it('shows what reset categories returned to Available to Fund', () => {
    expect(row(coffee)).toMatchObject({ carriedInCents: 0, fundedCents: 3_000, activityCents: -1_700, remainingCents: 0, returnedCents: 1_300 })
    expect(report.showReturned).toBe(true)
  })

  it('totals groups and the whole report', () => {
    const general = report.groups.find(g => g.id === 'general')!
    expect(general.totals.fundedCents).toBe(5_000 + 3_000 + 5_000)
    expect(report.totals.activityCents).toBe(-500 - 1_700 - 2_000)
  })

  it('summarizes cash, splitting offerings into undesignated and designated, and reconciles', () => {
    const s = report.summary
    expect(s).toMatchObject({
      cashStartCents: 97_000,
      undesignatedOfferingsCents: 30_000,
      designatedOfferingsCents: 5_000,
      otherInCents: 1_000,
      outCents: -9_200,
      transfersCents: -2_500,
      uncategorizedCents: -700,
      cashEndCents: 120_600,
    })
    expect(s.cashStartCents + s.undesignatedOfferingsCents + s.designatedOfferingsCents + s.otherInCents + s.outCents + s.transfersCents + s.uncategorizedCents).toBe(s.cashEndCents)
    expect(report.uncategorizedCount).toBe(1)
    expect(s.availableToFundEndCents).toBe(budget.monthView('2027-06').availableToFundCents)
  })

  it('names the period and knows when it is not over', () => {
    expect(report).toMatchObject({ label: 'January–June 2027', months: ['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'], toDate: false })
    const second = reports.semiAnnualReport({ year: 2027, half: 2 }, db, '2027-09')
    expect(second.months[0]).toBe('2027-07')
    expect(second.toDate).toBe(true)
  })

  it('lists transactions without payees or memos for sensitive categories, and no bank wording', () => {
    const lines = reports.reportTransactions(FIRST_HALF)
    const help = lines.find(l => l.category === 'Benevolence')!
    expect(help).toMatchObject({ payee: 'Benevolence', memo: null, amountCents: -2_000 })
    expect(JSON.stringify(lines)).not.toMatch(/Jane Doe|Rent help|bankDescription/)
    expect(lines.some(l => l.postedOn === '2027-07-01')).toBe(false)
    expect(lines.find(l => l.payee === 'Card payment')).toMatchObject({ isTransfer: true })
  })

  it('writes CSVs that spreadsheets cannot run as formulas', () => {
    const summary = output.renderReportCsv(report)
    expect(summary).toContain('Activity January 2027')
    expect(summary).toContain('Youth')
    const detail = output.renderTransactionsCsv(reports.reportTransactions(FIRST_HALF))
    expect(detail).toContain('\'=HYPERLINK')
    expect(detail.split(/\r?\n/)[0]).toBe('Date,Account,Group,Category,Payee,Memo,Amount,Transfer')
  })

  it('reports a group as a total only when it is set that way, in every output', async () => {
    const staff = db.insert(schema.categoryGroups).values({ name: 'Staff', reportDetail: 'total', sortOrder: 5 }).returning().get().id
    const salary = db.insert(schema.categories).values({ groupId: staff, name: 'Associate pastor salary' }).returning().get().id
    fund(salary, '2027-03', 40_000)
    enter('2027-03-31', -40_000, salary, 'Pat Pastor', 'March pay')

    const withStaff = reports.semiAnnualReport(FIRST_HALF, db, '2027-09')
    const group = withStaff.groups.find(g => g.id === staff)!
    expect(group).toMatchObject({ name: 'Staff', reportDetail: 'total', categories: [] })
    expect(group.totals).toMatchObject({ fundedCents: 40_000, activityCents: -40_000, remainingCents: 0 })
    expect(withStaff.totals.fundedCents).toBe(report.totals.fundedCents + 40_000)
    expect(JSON.stringify(withStaff)).not.toContain('Associate pastor salary')

    const lines = reports.reportTransactions(FIRST_HALF).filter(l => l.group === 'Staff')
    expect(lines).toEqual([expect.objectContaining({ category: 'Staff', payee: 'Staff', memo: null, amountCents: -40_000 })])
    const csv = output.renderReportCsv(withStaff) + output.renderTransactionsCsv(reports.reportTransactions(FIRST_HALF))
    expect(csv).not.toMatch(/Associate pastor salary|Pat Pastor|March pay/)
    expect(csv).toContain('Staff total')
    expect((await output.renderReportPdf(withStaff, 'Lifegate Baptist Church')).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('renders the report as a PDF', async () => {
    const pdf = await output.renderReportPdf(report, 'Lifegate Baptist Church')
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(output.reportFilename(report)).toBe('lifegate-2027-jan-jun-report')
  })
})
