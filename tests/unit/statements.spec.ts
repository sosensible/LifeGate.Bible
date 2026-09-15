// Year-end giving statements and their PDF, against a throwaway SQLite database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-statements-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let giving: typeof import('../../server/lib/giving')
let statements: typeof import('../../server/lib/statements')
let pdf: typeof import('../../server/lib/statement-pdf')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  giving = await import('../../server/lib/giving')
  statements = await import('../../server/lib/statements')
  pdf = await import('../../server/lib/statement-pdf')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// Undesignated: no fund, goes to Available to Fund.
const UNDESIGNATED = null

describe('statements', () => {
  let treasurer: string
  let smiths: string
  let lee: string
  let missions: string

  const count = (countedOn: string, entries: Array<{ giverId: string | null, cents: number, categoryId?: string | null, method?: 'cash' | 'check' | 'online', receivedOn?: string }>, close = true) =>
    db.transaction((tx) => {
      const cash = entries.filter(e => (e.method ?? 'cash') === 'cash').reduce((s, e) => s + e.cents, 0)
      const checks = entries.filter(e => e.method === 'check').reduce((s, e) => s + e.cents, 0)
      const id = giving.openCount(tx, { countedOn, label: null, expectedCashCents: cash, expectedCheckCents: checks, openedByUserId: treasurer })
      for (const e of entries) {
        giving.addGift(tx, id, { giverId: e.giverId, method: e.method ?? 'cash', checkNumber: null, receivedOn: e.receivedOn ?? null, lines: [{ categoryId: e.categoryId === undefined ? UNDESIGNATED : e.categoryId, amountCents: e.cents }] })
      }
      if (close) giving.closeCount(tx, id, treasurer)
      return id
    })

  beforeAll(() => {
    treasurer = db.insert(schema.user).values({ id: crypto.randomUUID(), name: 'T', email: 't@example.org', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }).returning().get().id
    missions = db.insert(schema.categories).values({ groupId: 'general', name: 'Missions' }).returning().get().id
    const make = (statementName: string, delivery: 'email' | 'mail') => db.transaction(tx => giving.createGiver(tx, {
      statementName, householdId: null, personId: null, mailingAddress: '1 Main St\nTown, MI 48000', email: delivery === 'email' ? 'giver@example.org' : null, delivery, notes: null,
    }))
    smiths = make('John & Mary Smith', 'email')
    lee = make('Grace Lee', 'mail')

    count('2026-12-27', [{ giverId: smiths, cents: 99_999 }]) // other year
    count('2027-01-03', [{ giverId: smiths, cents: 10_000 }, { giverId: null, cents: 2_500 }, { giverId: lee, cents: 5_000, method: 'check' }])
    count('2027-06-06', [{ giverId: smiths, cents: 25_000, categoryId: missions, method: 'check' }])
    count('2027-12-28', [{ giverId: lee, cents: 7_777 }], false) // still open
    // A check mailed by December 31, counted in January.
    count('2028-01-02', [{ giverId: smiths, cents: 1_000, method: 'check', receivedOn: '2027-12-31' }])
  })

  it('includes closed counts in the year, by received date, and leaves out loose cash', () => {
    const view = statements.statementFor(2027, smiths)
    expect(view.gifts.map(g => [g.receivedOn, g.amountCents])).toEqual([['2027-01-03', 10_000], ['2027-06-06', 25_000], ['2027-12-31', 1_000]])
    expect(view.designations).toEqual([{ givenTo: 'Undesignated', amountCents: 11_000 }, { givenTo: 'Missions', amountCents: 25_000 }])
    expect(view.totalCents).toBe(36_000)
    expect(statements.statementFor(2027, lee).totalCents).toBe(5_000)
    expect(statements.statementFor(2026, smiths).totalCents).toBe(99_999)
  })

  it('lists givers for the year and warns about open counts', () => {
    const list = statements.statementRows(2027)
    expect(list.rows.map(r => [r.statementName, r.totalCents])).toEqual([['Grace Lee', 5_000], ['John & Mary Smith', 36_000]])
    expect(list.openCounts).toBe(1)
    expect(statements.statementRows(2028).rows).toEqual([])
  })

  it('flags a statement that changed after it was sent', () => {
    statements.recordDelivery(db, { giverId: lee, year: 2027, method: 'print', sentTo: null, status: 'sent', error: null, totalCents: 5_000, sentByUserId: treasurer })
    expect(statements.statementRows(2027).rows.find(r => r.giverId === lee)).toMatchObject({ changedSinceSent: false, lastDelivery: { method: 'print', status: 'sent' } })

    count('2027-12-29', [{ giverId: lee, cents: 500 }])
    expect(statements.statementRows(2027).rows.find(r => r.giverId === lee)).toMatchObject({ totalCents: 5_500, changedSinceSent: true })
  })

  it('keeps settings with the fixed IRS wording outside them', () => {
    const fields = db.transaction(tx => statements.saveStatementSettings(tx, {
      legalName: 'Lifegate Baptist Church', mailingAddress: 'PO Box 1\nTown, MI', ein: '12-3456789', signerName: 'Pat Treasurer', signerTitle: 'Treasurer', closingMessage: null, emailSubject: null,
    }))
    expect(fields).toEqual(['mailingAddress', 'ein', 'signerName', 'signerTitle'])
    expect(statements.loadStatementSettings()).toMatchObject({ ein: '12-3456789', signerName: 'Pat Treasurer' })
  })

  it('renders statements as PDF, one page or more per giver', async () => {
    const settings = statements.loadStatementSettings()
    const single = await pdf.renderStatement(statements.statementFor(2027, smiths), settings)
    expect(single.subarray(0, 5).toString()).toBe('%PDF-')

    const both = await pdf.renderStatements(statements.statementsFor(2027, [smiths, lee]), settings)
    const pages = both.toString('latin1').match(/\/Type \/Page\b/g) ?? []
    expect(pages.length).toBeGreaterThanOrEqual(2)
    expect(pdf.statementFilename(statements.statementFor(2027, smiths))).toBe('2027-contribution-statement-john-mary-smith.pdf')
  })
})
