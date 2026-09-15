// Offerings: counts, gifts, giving records and deposits, against a throwaway SQLite database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-giving-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let giving: typeof import('../../server/lib/giving')
let budget: typeof import('../../server/lib/budget')
let transactions: typeof import('../../server/lib/transactions')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  giving = await import('../../server/lib/giving')
  budget = await import('../../server/lib/budget')
  transactions = await import('../../server/lib/transactions')
  orm = await import('drizzle-orm')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// Undesignated: no fund, goes to Available to Fund.
const UNDESIGNATED = null

describe('offerings', () => {
  let treasurer: string
  let missionsCategory: string
  let smiths: string
  let checking: string

  beforeAll(() => {
    treasurer = db.insert(schema.user).values({ id: crypto.randomUUID(), name: 'T', email: 't@example.org', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }).returning().get().id
    missionsCategory = db.insert(schema.categories).values({ groupId: 'general', name: 'Missions' }).returning().get().id
    checking = db.insert(schema.financeAccounts).values({ name: 'Checking', kind: 'checking', source: 'simplefin', externalId: 'acct-1', balanceCents: 0 }).returning().get().id
    smiths = db.transaction(tx => giving.createGiver(tx, {
      statementName: 'John & Mary Smith', householdId: null, personId: null, mailingAddress: '1 Main St\nTown, MI', email: 'smith@example.org', delivery: 'email', notes: null,
    }))
  })

  const newCount = (countedOn: string, cash: number, checks: number) =>
    db.transaction(tx => giving.openCount(tx, { countedOn, label: 'Sunday morning', expectedCashCents: cash, expectedCheckCents: checks, openedByUserId: treasurer }))

  it('offers spending categories in use for designated gifts, and nothing else', () => {
    const names = giving.designationGroups().flatMap(g => g.categories.map(c => c.name))
    expect(names).toEqual(['Missions'])
    const countId = newCount('2027-01-01', 0, 0)
    expect(() => db.transaction(tx => giving.addGift(tx, countId, { giverId: null, method: 'online', checkNumber: null, receivedOn: null, lines: [{ categoryId: 'available-to-fund', amountCents: 100 }] }))).toThrow(/in use/)
    db.transaction(tx => tx.delete(schema.offeringCounts).where(orm.eq(schema.offeringCounts.id, countId)).run())
  })

  it('closes a count only when it matches the count sheet, then refuses changes', () => {
    const countId = newCount('2027-01-03', 5_000, 30_000)
    db.transaction((tx) => {
      giving.addGift(tx, countId, { giverId: null, method: 'cash', checkNumber: null, receivedOn: null, lines: [{ categoryId: UNDESIGNATED, amountCents: 5_000 }] })
      // One check split between undesignated giving and Missions.
      giving.addGift(tx, countId, { giverId: smiths, method: 'check', checkNumber: '1042', receivedOn: null, lines: [{ categoryId: UNDESIGNATED, amountCents: 20_000 }, { categoryId: missionsCategory, amountCents: 5_000 }] })
    })
    expect(() => db.transaction(tx => giving.closeCount(tx, countId, treasurer))).toThrow(/don’t match/)

    db.transaction(tx => giving.addGift(tx, countId, { giverId: smiths, method: 'check', checkNumber: '1043', receivedOn: null, lines: [{ categoryId: missionsCategory, amountCents: 5_000 }] }))
    const view = giving.loadCount(countId)
    expect(view.balanced).toBe(true)
    expect(view.gifts).toHaveLength(4)
    expect(view.totals).toMatchObject({ cashCents: 5_000, checkCents: 30_000, totalCents: 35_000 })
    expect(view.totals.byCategory).toEqual([
      { categoryId: null, givenTo: 'Undesignated', amountCents: 25_000 },
      { categoryId: missionsCategory, givenTo: 'Missions', amountCents: 10_000 },
    ])

    db.transaction(tx => giving.closeCount(tx, countId, treasurer))
    expect(() => db.transaction(tx => giving.addGift(tx, countId, { giverId: null, method: 'cash', checkNumber: null, receivedOn: null, lines: [{ categoryId: UNDESIGNATED, amountCents: 100 }] }))).toThrow(/closed/)
    expect(() => db.transaction(tx => giving.removeGift(tx, countId, view.gifts[0]!.id))).toThrow(/closed/)
  })

  it('keeps a category with designated gifts from being removed', async () => {
    const stewardship = await import('../../server/lib/stewardship')
    expect(() => db.transaction(tx => stewardship.deleteCategory(tx, missionsCategory))).toThrow(/designated gifts/)
  })

  it('keeps a memo with a designated gift only', () => {
    const countId = newCount('2027-01-24', 0, 0)
    db.transaction(tx => giving.addGift(tx, countId, { giverId: smiths, method: 'online', checkNumber: null, receivedOn: null, lines: [{ categoryId: missionsCategory, amountCents: 2_000, memo: 'For the Reyes family’s visit' }] }))
    expect(giving.loadCount(countId).gifts[0]).toMatchObject({ givenTo: 'Missions', memo: 'For the Reyes family’s visit' })
    expect(giving.loadGiver(smiths, 2027).gifts.find(g => g.countId === countId)?.memo).toBe('For the Reyes family’s visit')
    expect(() => db.transaction(tx => giving.addGift(tx, countId, { giverId: null, method: 'online', checkNumber: null, receivedOn: null, lines: [{ categoryId: UNDESIGNATED, amountCents: 100, memo: 'note' }] }))).toThrow(/only for designated/)
    db.transaction(tx => tx.delete(schema.offeringCounts).where(orm.eq(schema.offeringCounts.id, countId)).run())
  })

  it('refuses a check number on cash', () => {
    const countId = newCount('2027-01-10', 100, 0)
    expect(() => db.transaction(tx => giving.addGift(tx, countId, { giverId: null, method: 'cash', checkNumber: '12', receivedOn: null, lines: [{ categoryId: UNDESIGNATED, amountCents: 100 }] }))).toThrow(/check number/)
  })

  it('moves gifts dated with the count when the count date changes', () => {
    const countId = newCount('2027-01-17', 0, 0)
    db.transaction((tx) => {
      giving.addGift(tx, countId, { giverId: smiths, method: 'online', checkNumber: null, receivedOn: null, lines: [{ categoryId: UNDESIGNATED, amountCents: 1_000 }] })
      giving.addGift(tx, countId, { giverId: smiths, method: 'online', checkNumber: null, receivedOn: '2027-01-12', lines: [{ categoryId: UNDESIGNATED, amountCents: 1_000 }] })
      giving.updateCount(tx, countId, { countedOn: '2027-01-18' })
    })
    expect(giving.loadCount(countId).gifts.map(g => g.receivedOn)).toEqual(['2027-01-18', '2027-01-12'])
  })

  it('gives counters names only when searching', () => {
    const results = giving.searchGivers('smi')
    expect(results).toEqual([{ id: smiths, statementName: 'John & Mary Smith' }])
    expect(giving.searchGivers('100%')).toEqual([])
  })

  it('archives, never deletes, a giver with gifts', () => {
    expect(() => db.transaction(tx => giving.deleteGiver(tx, smiths))).toThrow(/only be archived/)
    const unused = db.transaction(tx => giving.createQuickGiver(tx, 'Visitor'))
    db.transaction(tx => giving.deleteGiver(tx, unused))
    expect(giving.searchGivers('Visitor')).toEqual([])
  })

  it('keeps the giving record when its household is removed', () => {
    const householdId = db.insert(schema.households).values({ name: 'Jones Household' }).returning().get().id
    const giverId = db.transaction(tx => giving.createGiver(tx, { statementName: 'Bob Jones', householdId, personId: null, mailingAddress: null, email: null, delivery: 'mail', notes: null }))
    db.delete(schema.households).where(orm.eq(schema.households.id, householdId)).run()
    expect(giving.loadGivers(2027, db, [giverId])[0]).toMatchObject({ statementName: 'Bob Jones', householdId: null })
  })

  describe('deposits', () => {
    let countId: string

    beforeAll(() => {
      countId = giving.loadCounts({ openOnly: false, withTotals: true }).find(c => c.countedOn === '2027-01-03')!.id
    })

    it('reopens only with no deposit linked', () => {
      db.transaction(tx => giving.reopenCount(tx, countId, 'Check entered twice'))
      db.transaction(tx => giving.closeCount(tx, countId, treasurer))
    })

    it('offers deposits for exactly the count total, near its date, in cash accounts', () => {
      const add = (externalId: string, postedOn: string, amountCents: number) =>
        db.transaction((tx) => {
          const id = tx.insert(schema.financeTransactions).values({ accountId: checking, externalId, postedOn, amountCents, bankDescription: 'DEPOSIT', source: 'simplefin' }).returning().get().id
          tx.insert(schema.transactionSplits).values({ transactionId: id, categoryId: null, amountCents }).run()
          return id
        })
      const good = add('d1', '2027-01-04', 35_000)
      add('d2', '2027-01-04', 34_999)
      add('d3', '2027-02-20', 35_000)
      expect(giving.depositCandidates(countId).map(c => c.id)).toEqual([good])
    })

    it('splits the deposit into the funds’ categories, raising Available to Fund', () => {
      const [candidate] = giving.depositCandidates(countId)
      const before = budget.monthView('2027-01').availableToFundCents
      db.transaction(tx => giving.linkDeposit(tx, countId, candidate!.id))

      const transaction = transactions.loadTransaction(candidate!.id, { canManage: true })!
      expect(transaction.payee).toBe('Offering')
      expect(transaction.splits.map(s => [s.categoryId, s.amountCents])).toEqual([['available-to-fund', 25_000], [missionsCategory, 10_000]])
      expect(JSON.stringify(transaction)).not.toMatch(/Smith/)

      const after = budget.monthView('2027-01')
      // Missions money is in its category; only undesignated giving is unassigned.
      expect(after.availableToFundCents - before).toBe(25_000)
      expect(giving.loadCount(countId).deposit).toMatchObject({ transactionId: candidate!.id, accountName: 'Checking' })
      expect(giving.depositCandidates(countId)).toEqual([])
    })

    it('refuses to reopen while linked, and unlinking restores one uncategorized line', () => {
      expect(() => db.transaction(tx => giving.reopenCount(tx, countId, 'Check entered twice'))).toThrow(/Unlink/)
      const transactionId = db.transaction(tx => giving.unlinkDeposit(tx, countId))
      expect(transactions.loadTransaction(transactionId, { canManage: true })!.splits).toEqual([expect.objectContaining({ categoryId: null, amountCents: 35_000 })])
    })

    it('records a deposit in a manual cash account', () => {
      const cashBox = db.insert(schema.financeAccounts).values({ name: 'Cash box', kind: 'cash' }).returning().get().id
      expect(giving.manualCashAccounts()).toEqual([{ id: cashBox, name: 'Cash box' }])
      const transactionId = db.transaction(tx => giving.recordDeposit(tx, countId, cashBox, '2027-01-03'))
      const transaction = transactions.loadTransaction(transactionId, { canManage: true })!
      expect(transaction).toMatchObject({ amountCents: 35_000, payee: 'Offering', accountName: 'Cash box' })
      expect(transaction.splits).toHaveLength(2)
      expect(() => db.transaction(tx => giving.recordDeposit(tx, countId, cashBox, '2027-01-03'))).toThrow(/already has a deposit/)
    })
  })
})
