// Adding, editing and removing ministries, against a throwaway SQLite database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-ministries-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let lib: typeof import('../../server/lib/ministries')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/ministries')
  orm = await import('drizzle-orm')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const bySlug = (slug: string) => lib.loadMinistriesForAdmin().find(m => m.slug === slug)

describe('ministries', () => {
  it('adds a ministry with a web address from its name, and refuses a duplicate name', () => {
    db.transaction(tx => lib.createMinistry(tx, { name: 'Youth Group', description: 'Teens growing in faith together.' }))
    expect(bySlug('youth-group')).toMatchObject({ name: 'Youth Group', servingCount: 0, protected: false })
    expect(() => db.transaction(tx => lib.createMinistry(tx, { name: 'youth group', description: 'Again' }))).toThrow(/already exists/)
  })

  it('keeps the web address when a ministry is renamed', () => {
    const id = bySlug('youth-group')!.id
    const fields = db.transaction(tx => lib.updateMinistry(tx, id, { name: 'Student Ministry', description: 'Teens growing in faith together.' }))
    expect(fields).toEqual(['name'])
    expect(bySlug('youth-group')).toMatchObject({ name: 'Student Ministry' })
  })

  it('removes only a ministry nobody serves in and no budget is shared with', () => {
    const hospitality = bySlug('hospitality')!
    const personId = db.insert(schema.people).values({ firstName: 'Hope', lastName: 'Host' }).returning().get().id
    db.insert(schema.ministryMembers).values({ ministryId: hospitality.id, personId, isLeader: true }).run()
    expect(bySlug('hospitality')).toMatchObject({ servingCount: 1, leaderCount: 1 })
    expect(() => db.transaction(tx => lib.deleteMinistry(tx, hospitality.id))).toThrow(/People serve/)

    db.delete(schema.ministryMembers).where(orm.eq(schema.ministryMembers.ministryId, hospitality.id)).run()
    db.insert(schema.ministryCategoryAccess).values({ ministryId: hospitality.id, categoryId: 'available-to-fund', level: 'totals' }).run()
    expect(() => db.transaction(tx => lib.deleteMinistry(tx, hospitality.id))).toThrow(/Budget categories/)

    db.delete(schema.ministryCategoryAccess).where(orm.eq(schema.ministryCategoryAccess.ministryId, hospitality.id)).run()
    db.transaction(tx => lib.deleteMinistry(tx, hospitality.id))
    expect(bySlug('hospitality')).toBeUndefined()
  })

  it('never removes the Missions ministry, which decides who edits the Missions pages', () => {
    const missions = bySlug('missions')!
    expect(missions.protected).toBe(true)
    expect(() => db.transaction(tx => lib.deleteMinistry(tx, missions.id))).toThrow(/Missions/)
  })

  it('gives a second ministry with the same starting words its own address', () => {
    db.transaction(tx => lib.createMinistry(tx, { name: 'Music!', description: 'A second music team.' }))
    expect(bySlug('music-2')).toMatchObject({ name: 'Music!' })
  })
})
