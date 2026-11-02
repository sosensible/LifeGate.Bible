// Who may be named as having counted an offering, against a throwaway database.
// The aim is that "counted by" is a verified choice, not text anyone can type.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-counters-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let giving: typeof import('../../server/lib/giving')
let counters: typeof import('../../server/lib/counters')
let orm: typeof import('drizzle-orm')

const addUser = (id: string, name: string, role: string, banned = false) => {
  const now = new Date()
  db.insert(schema.user).values({ id, name, email: `${id}@example.org`, emailVerified: true, role, banned, createdAt: now, updatedAt: now }).run()
}
const statusOf = (fn: () => unknown) => {
  try { fn() }
  catch (error) { return (error as { statusCode?: number }).statusCode }
  return undefined
}

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  giving = await import('../../server/lib/giving')
  counters = await import('../../server/lib/counters')
  orm = await import('drizzle-orm')

  addUser('treasurer', 'Tess Treasurer', 'treasurer,member')
  addUser('counter-a', 'Carl Counter', 'counter,member')
  addUser('counter-b', 'Cora Counter', 'counter')
  addUser('blocked-counter', 'Blocked Counter', 'counter', true)
  addUser('plain-member', 'Mia Member', 'member')
  addUser('admin', 'Adam Admin', 'admin,member')
  addUser('finance', 'Fin Committee', 'financeCommittee,member')
  addUser('nobody', 'Nobody', 'user')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const open = (counterUserIds?: string[]) =>
  db.transaction(tx => giving.openCount(tx, { countedOn: '2027-02-07', label: 'Sunday morning', expectedCashCents: 0, expectedCheckCents: 0, openedByUserId: 'treasurer', counterUserIds }))
const row = (id: string) => db.select().from(schema.offeringCounts).where(orm.eq(schema.offeringCounts.id, id)).get()!

describe('who may count', () => {
  it('is whoever holds a role that may enter gifts, and nobody else', () => {
    expect(counters.listCounters().map(c => c.userId).sort()).toEqual(['counter-a', 'counter-b', 'treasurer'])
  })

  it('leaves out a blocked account, an administrator, the finance committee and plain members', () => {
    const ids = counters.listCounters().map(c => c.userId)
    for (const left of ['blocked-counter', 'admin', 'finance', 'plain-member', 'nobody']) expect(ids).not.toContain(left)
  })

  it('shows the directory name when the account has one, and lists by name', () => {
    db.insert(schema.people).values({ firstName: 'Caroline', lastName: 'Counterman', userId: 'counter-a' }).run()
    const list = counters.listCounters()
    expect(list.find(c => c.userId === 'counter-a')!.name).toBe('Caroline Counterman')
    expect(list.map(c => c.name)).toEqual([...list.map(c => c.name)].sort((a, b) => a.localeCompare(b)))
  })
})

describe('naming who counted', () => {
  it('records the people chosen, with their names as they were', () => {
    const id = open(['counter-a', 'counter-b'])
    expect(row(id).counterUserIds).toEqual(['counter-a', 'counter-b'])
    expect(row(id).counterNames).toBe('Caroline Counterman, Cora Counter')
    expect(giving.loadCount(id)!.counters).toEqual([{ userId: 'counter-a', name: 'Caroline Counterman' }, { userId: 'counter-b', name: 'Cora Counter' }])
  })

  it('refuses anyone who may not count, or who does not exist, and writes nothing', () => {
    for (const bad of ['plain-member', 'admin', 'blocked-counter', 'no-such-user']) {
      expect(statusOf(() => open(['counter-b', bad]))).toBe(400)
    }
    expect(db.select().from(schema.offeringCounts).all().filter(c => c.countedOn === '2027-02-07').length).toBeGreaterThan(0)
    const before = db.select().from(schema.offeringCounts).all().length
    expect(statusOf(() => open(['plain-member']))).toBe(400)
    expect(db.select().from(schema.offeringCounts).all().length).toBe(before)
  })

  it('names someone once however many times they are listed, and no one when none are chosen', () => {
    expect(row(open(['counter-b', 'counter-b'])).counterUserIds).toEqual(['counter-b'])
    const none = row(open([]))
    expect(none.counterUserIds).toEqual([])
    expect(none.counterNames).toBeNull()
  })

  it('leaves who counted empty when it is not given at all', () => {
    const count = row(open())
    expect(count.counterUserIds).toBeNull()
    expect(count.counterNames).toBeNull()
  })

  it('changes who counted on an open count, naming the field in the audit trail once', () => {
    const id = open(['counter-b'])
    const fields = db.transaction(tx => giving.updateCount(tx, id, { counterUserIds: ['counter-a', 'treasurer'] }))
    expect(fields).toEqual(['counterNames'])
    expect(row(id).counterNames).toBe('Caroline Counterman, Tess Treasurer')
    expect(statusOf(() => db.transaction(tx => giving.updateCount(tx, id, { counterUserIds: ['plain-member'] })))).toBe(400)
  })

  it('does nothing when the same people are chosen again, or when it is left out of the change', () => {
    const id = open(['counter-b'])
    expect(db.transaction(tx => giving.updateCount(tx, id, { counterUserIds: ['counter-b'] }))).toEqual([])
    expect(db.transaction(tx => giving.updateCount(tx, id, { label: 'Wednesday evening' }))).toEqual(['label'])
    expect(row(id).counterUserIds).toEqual(['counter-b'])
  })

  it('lets someone who has since lost the right stay on a count they counted, but not be added', () => {
    const id = open(['counter-b'])
    db.update(schema.user).set({ role: 'member' }).where(orm.eq(schema.user.id, 'counter-b')).run()
    expect(db.transaction(tx => giving.updateCount(tx, id, { counterUserIds: ['counter-b', 'treasurer'] }))).toEqual(['counterNames'])
    expect(row(id).counterUserIds).toEqual(['counter-b', 'treasurer'])
    expect(statusOf(() => open(['counter-b']))).toBe(400)
    db.update(schema.user).set({ role: 'counter' }).where(orm.eq(schema.user.id, 'counter-b')).run()
  })

  it('keeps names typed in before this existed, until people are chosen', () => {
    const id = open()
    db.update(schema.offeringCounts).set({ counterNames: 'Pat and Lee' }).where(orm.eq(schema.offeringCounts.id, id)).run()
    expect(db.transaction(tx => giving.updateCount(tx, id, { label: 'Special offering' }))).toEqual(['label'])
    expect(db.transaction(tx => giving.updateCount(tx, id, { counterUserIds: [] }))).toEqual([])
    expect(row(id).counterNames).toBe('Pat and Lee')
    expect(giving.loadCount(id)!.counters).toEqual([])
    db.transaction(tx => giving.updateCount(tx, id, { counterUserIds: ['treasurer'] }))
    expect(row(id).counterNames).toBe('Tess Treasurer')
  })

  it('shows a counter by their recorded name even after their account is deleted, without inventing one', () => {
    addUser('leaver', 'Lee Leaver', 'counter')
    const id = open(['leaver'])
    db.delete(schema.user).where(orm.eq(schema.user.id, 'leaver')).run()
    expect(row(id).counterNames).toBe('Lee Leaver')
    expect(giving.loadCount(id)!.counters).toEqual([])
  })
})
