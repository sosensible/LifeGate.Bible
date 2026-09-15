// What ministries see of the budget, against a throwaway SQLite database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-stewardship-access-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let access: typeof import('../../server/lib/stewardship-access')
let transactions: typeof import('../../server/lib/transactions')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  access = await import('../../server/lib/stewardship-access')
  transactions = await import('../../server/lib/transactions')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const addUser = (email: string) =>
  db.insert(schema.user).values({ id: crypto.randomUUID(), name: email, email, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }).returning().get().id

const ministry = async (slug: string) => {
  const { eq } = await import('drizzle-orm')
  return db.select().from(schema.ministries).where(eq(schema.ministries.slug, slug)).get()!
}

const serve = (userId: string, firstName: string, ministryId: string, isLeader: boolean) => {
  const personId = db.insert(schema.people).values({ firstName, lastName: 'Test', userId }).returning().get().id
  db.insert(schema.ministryMembers).values({ ministryId, personId, isLeader }).run()
}

const grant = (ministryId: string, categoryId: string, level: 'none' | 'totals' | 'ledger', audience: 'leaders' | 'members', by: string) =>
  db.transaction(tx => access.setGrant(tx, { ministryId, categoryId, level, audience }, by))

describe('ministry access', () => {
  let secretary: string
  let leader: string
  let helper: string
  let outsider: string
  let music: Awaited<ReturnType<typeof ministry>>
  let youth: string
  let hymnals: string
  let benevolence: string

  beforeAll(async () => {
    secretary = addUser('secretary@example.org')
    leader = addUser('leader@example.org')
    helper = addUser('helper@example.org')
    outsider = addUser('outsider@example.org')
    music = await ministry('music')
    serve(leader, 'Lena', music.id, true)
    serve(helper, 'Hal', music.id, false)

    youth = db.insert(schema.categories).values({ groupId: 'general', name: 'Youth' }).returning().get().id
    hymnals = db.insert(schema.categories).values({ groupId: 'general', name: 'Hymnals' }).returning().get().id
    benevolence = db.insert(schema.categories).values({ groupId: 'general', name: 'Benevolence', isSensitive: true }).returning().get().id

    const checking = db.insert(schema.financeAccounts).values({ name: 'Checking', kind: 'checking', openingBalanceCents: 100_000 }).returning().get().id
    db.transaction((tx) => {
      transactions.createManualTransaction(tx, { accountId: checking, postedOn: '2026-05-04', amountCents: -2_500, payee: 'Hymn Supply Co', memo: 'Choir folders', categoryId: hymnals })
      transactions.createManualTransaction(tx, { accountId: checking, postedOn: '2026-04-28', amountCents: -1_000, payee: 'Last month', memo: null, categoryId: hymnals })
      transactions.createManualTransaction(tx, { accountId: checking, postedOn: '2026-05-06', amountCents: -30_000, payee: 'A family in need', memo: null, categoryId: benevolence })
    })
  })

  it('records grant, change and revoke, and nothing for a no-op', () => {
    expect(grant(music.id, youth, 'totals', 'leaders', secretary)).toBe('ministryAccess.grant')
    expect(grant(music.id, youth, 'totals', 'leaders', secretary)).toBeNull()
    expect(grant(music.id, youth, 'ledger', 'leaders', secretary)).toBe('ministryAccess.change')
    expect(grant(music.id, youth, 'none', 'leaders', secretary)).toBe('ministryAccess.revoke')
    expect(grant(music.id, youth, 'none', 'leaders', secretary)).toBeNull()
  })

  it('never grants a sensitive category’s ledger', () => {
    expect(() => grant(music.id, benevolence, 'ledger', 'leaders', secretary)).toThrow(/totals only/)
  })

  it('shows leaders-only grants to leaders, and members grants to everyone serving', () => {
    grant(music.id, hymnals, 'ledger', 'leaders', secretary)
    grant(music.id, benevolence, 'totals', 'members', secretary)

    expect(access.grantsForUser(leader).get(music.id)).toEqual(new Map([[hymnals, 'ledger'], [benevolence, 'totals']]))
    expect(access.grantsForUser(helper).get(music.id)).toEqual(new Map([[benevolence, 'totals']]))
    expect(access.grantsForUser(outsider).size).toBe(0)
    expect(access.ministryBudgetsFor(outsider, { seesAll: false })).toEqual([])
    expect(access.ministryBudgetsFor(leader, { seesAll: false })).toEqual([{ slug: 'music', name: music.name, categoryCount: 2 }])
  })

  it('gives leaders the month’s ledger for granted categories and totals only for sensitive ones', () => {
    const view = access.ministryBudgetView('music', '2026-05', { userId: leader, seesAll: false })
    const byName = Object.fromEntries(view.categories.map(c => [c.name, c]))
    expect(byName.Hymnals).toMatchObject({ level: 'ledger', activityCents: -2_500 })
    expect(byName.Hymnals!.ledger).toEqual([
      expect.objectContaining({ postedOn: '2026-05-04', payee: 'Hymn Supply Co', memo: 'Choir folders', amountCents: -2_500 }),
    ])
    expect(byName.Benevolence).toMatchObject({ level: 'totals', activityCents: -30_000 })
    expect(byName.Benevolence).not.toHaveProperty('ledger')
    expect(view.categories.some(c => c.name === 'Youth')).toBe(false)

    expect(() => access.ministryBudgetView('music', '2026-05', { userId: outsider, seesAll: false })).toThrow(/Not allowed/)
    expect(access.ministryBudgetView('music', '2026-05', { userId: outsider, seesAll: true }).categories).toHaveLength(2)
  })

  it('gives grant managers names and grants, and no amounts', () => {
    const matrix = access.accessMatrix()
    expect(JSON.stringify(matrix)).not.toMatch(/Cents|amount|payee/i)
    expect(matrix.groups[0]!.categories.map(c => c.name)).toEqual(expect.arrayContaining(['Hymnals', 'Benevolence', 'Youth']))
    expect(matrix.grants).toEqual(expect.arrayContaining([{ ministryId: music.id, categoryId: hymnals, level: 'ledger', audience: 'leaders' }]))
  })

  it('keeps each ministry to its own categories: Hospitality cannot look at Music’s funds', async () => {
    const hospitality = await ministry('hospitality')
    const host = addUser('host@example.org')
    serve(host, 'Hope', hospitality.id, true)

    const coffee = db.insert(schema.categories).values({ groupId: 'general', name: 'Coffee' }).returning().get().id
    grant(hospitality.id, coffee, 'ledger', 'leaders', secretary)
    grant(music.id, hymnals, 'ledger', 'leaders', secretary)

    // Hospitality's leader sees Coffee, and nothing of Music.
    expect([...(access.grantsForUser(host).get(hospitality.id)?.keys() ?? [])]).toEqual([coffee])
    expect(access.grantsForUser(host).has(music.id)).toBe(false)
    expect(access.ministryBudgetsFor(host, { seesAll: false }).map(m => m.slug)).toEqual(['hospitality'])
    expect(() => access.ministryBudgetView('music', '2026-05', { userId: host, seesAll: false })).toThrow(/Not allowed/)
    expect(access.ministryBudgetView('hospitality', '2026-05', { userId: host, seesAll: false }).categories.map(c => c.name)).toEqual(['Coffee'])

    // And Music's leader does not see Coffee.
    expect(access.grantsForUser(leader).get(music.id)?.has(coffee)).toBe(false)
  })

  it('removes access when a grant is revoked', () => {
    grant(music.id, hymnals, 'none', 'leaders', secretary)
    expect(access.grantsForUser(leader).get(music.id)?.has(hymnals)).toBe(false)
  })
})
