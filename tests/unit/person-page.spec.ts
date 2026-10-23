// The member page, against a throwaway SQLite database. The risk is privacy: what
// each kind of viewer gets of each kind of person, and that nothing private to the
// owner is ever on the page. See docs/specs/member-page.md.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Viewer } from '../../shared/privacy'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-person-page-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let lib: typeof import('../../server/lib/person-page')
let peopleLib: typeof import('../../server/lib/people')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/person-page')
  peopleLib = await import('../../server/lib/people')
  orm = await import('drizzle-orm')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let n = 0
const unique = () => `${++n}`
const person = (first: string, extra: Partial<typeof schema.people.$inferInsert> = {}) =>
  db.insert(schema.people).values({ firstName: first, lastName: `T${unique()}`, ...extra }).returning().get()
const household = (name = `H${unique()}`) => db.insert(schema.households).values({ name, kind: 'married' }).returning().get().id
const serve = (slug: string, personId: string, options: { leader?: boolean, shown?: boolean } = {}) =>
  db.insert(schema.ministryMembers).values({
    ministryId: db.select({ id: schema.ministries.id }).from(schema.ministries).where(orm.eq(schema.ministries.slug, slug)).get()!.id,
    personId,
    isLeader: options.leader ?? false,
    showToMembers: options.shown ?? true,
  }).run()

const MEMBER = (personId: string | null = null): Viewer => ({ isMember: true, isStaff: false, personId })
const STAFF: Viewer = { isMember: true, isStaff: true, personId: null }
const NOT_A_MEMBER: Viewer = { isMember: false, isStaff: false, personId: null }

describe('what a member page shows', () => {
  it('shows another member only what they chose to share, with name, title and shown ministries', () => {
    const p = person('Shy', { title: 'Deacon', phone: '555-0100', email: 'shy@example.org', address: '1 Road', birthday: '1970-02-03', photoUrl: '/p.jpg' })
    serve('music', p.id)
    const page = lib.loadPersonPage(MEMBER(), p.id)!
    expect(page).toMatchObject({ firstName: 'Shy', title: 'Deacon', isSelf: false, kind: 'member' })
    for (const field of ['phone', 'email', 'address', 'birthday', 'photoUrl', 'householdName', 'sharing']) expect(page).not.toHaveProperty(field)
    expect(page.ministries.map(m => m.slug)).toEqual(['music'])
  })

  it('shows each detail once it is shared, and staff the contact details without any opt-in', () => {
    const p = person('Open', { phone: '555-0101', email: 'o@example.org', address: '2 Road', birthday: '1971-04-05', sharePhone: true, shareBirthday: true })
    const page = lib.loadPersonPage(MEMBER(), p.id)!
    expect(page).toMatchObject({ phone: '555-0101', birthday: '04-05' })
    expect(page).not.toHaveProperty('email')
    expect(page).not.toHaveProperty('address')
    const staff = lib.loadPersonPage(STAFF, p.id)!
    expect(staff).toMatchObject({ phone: '555-0101', email: 'o@example.org', address: '2 Road' })
  })

  it('leaves out a ministry the person asked not to be shown on, for everyone but them', () => {
    const p = person('Quiet')
    serve('music', p.id)
    serve('nursery', p.id, { shown: false })
    expect(lib.loadPersonPage(MEMBER(), p.id)!.ministries.map(m => m.slug)).toEqual(['music'])
    expect(lib.loadPersonPage(STAFF, p.id)!.ministries.map(m => m.slug)).toEqual(['music'])
    expect(lib.loadPersonPage(MEMBER(p.id), p.id)!.ministries.map(m => m.slug).sort()).toEqual(['music', 'nursery'])
  })

  it('marks who leads', () => {
    const p = person('Lead')
    serve('music', p.id, { leader: true })
    expect(lib.loadPersonPage(MEMBER(), p.id)!.ministries).toEqual([{ slug: 'music', name: 'Music', isLeader: true }])
  })

  it('is not there for someone who is not a member, nor for an unknown id', () => {
    const p = person('Anyone')
    expect(lib.loadPersonPage(NOT_A_MEMBER, p.id)).toBeNull()
    expect(lib.loadPersonPage(MEMBER(), 'no-such-person')).toBeNull()
  })
})

describe('your own page', () => {
  it('shows you all of your own details, and which of them others can see', () => {
    const me = person('Self', { title: 'Elder', phone: '555-0102', email: 's@example.org', address: '3 Road', birthday: '1960-06-07', photoUrl: '/s.jpg', sharePhone: true })
    const page = lib.loadPersonPage(MEMBER(me.id), me.id)!
    expect(page).toMatchObject({ isSelf: true, phone: '555-0102', email: 's@example.org', address: '3 Road', birthday: '06-07', photoUrl: '/s.jpg' })
    expect(page.sharing).toEqual({ phone: true, email: false, address: false, birthday: false, photo: false, household: false })
  })

  it('gives nobody else that "sharing" summary, staff included', () => {
    const me = person('Self2')
    expect(lib.loadPersonPage(MEMBER(), me.id)).not.toHaveProperty('sharing')
    expect(lib.loadPersonPage(STAFF, me.id)).not.toHaveProperty('sharing')
  })

  it('is not someone else’s page made yours by a matching id on the request', () => {
    const me = person('Me3')
    const other = person('Other3', { phone: '555-0103' })
    // Viewing another person while signed in as `me` is the ordinary view.
    expect(lib.loadPersonPage(MEMBER(me.id), other.id)).toMatchObject({ isSelf: false })
    expect(lib.loadPersonPage(MEMBER(me.id), other.id)).not.toHaveProperty('phone')
  })

  it('carries nothing that belongs to the private sections, for anyone', () => {
    const me = person('Self4')
    const allowed = new Set(['id', 'firstName', 'lastName', 'title', 'kind', 'isMinor', 'isSpeaker', 'isSelf', 'photoUrl', 'phone', 'email', 'address', 'birthday', 'householdName', 'ministries', 'messages', 'sharing'])
    for (const viewer of [MEMBER(me.id), MEMBER(), STAFF]) {
      expect(Object.keys(lib.loadPersonPage(viewer, me.id)!).filter(key => !allowed.has(key))).toEqual([])
    }
  })
})

describe('minors', () => {
  const family = () => {
    const h = household()
    const father = person('Father', { householdId: h, householdRole: 'father' })
    const mother = person('Mother', { householdId: h, householdRole: 'mother' })
    const child = person('Child', { householdId: h, householdRole: 'child', isMinor: true, phone: '555-0104', sharePhone: true })
    const otherH = household()
    const neighbour = person('Neighbour', { householdId: otherH, householdRole: 'father' })
    return { h, father, mother, child, neighbour }
  }
  const viewer = (p: { id: string, householdId: string | null, householdRole: string | null }): Viewer =>
    ({ isMember: true, isStaff: false, personId: p.id, householdId: p.householdId, householdRole: p.householdRole })

  it('is not shown to another member, the other household’s father, or the public', () => {
    const f = family()
    expect(lib.loadPersonPage(MEMBER(), f.child.id)).toBeNull()
    expect(lib.loadPersonPage(viewer(f.neighbour as never), f.child.id)).toBeNull()
    expect(lib.loadPersonPage(NOT_A_MEMBER, f.child.id)).toBeNull()
  })

  it('is shown to the household’s father and mother, and to staff', () => {
    const f = family()
    expect(lib.loadPersonPage(viewer(f.father as never), f.child.id)).toMatchObject({ firstName: 'Child', isMinor: true })
    expect(lib.loadPersonPage(viewer(f.mother as never), f.child.id)).toMatchObject({ firstName: 'Child', isMinor: true })
    expect(lib.loadPersonPage(STAFF, f.child.id)).toMatchObject({ isMinor: true })
  })

  it('shows the carer only what a member would see, not the child’s unshared details', () => {
    const f = family()
    const page = lib.loadPersonPage(viewer(f.father as never), f.child.id)!
    expect(page.phone).toBe('555-0104') // shared by the child
    expect(page).not.toHaveProperty('address')
    expect(page).not.toHaveProperty('birthday')
  })

  it('shows a married couple’s minor to the husband and to the wife, who are the household’s adults', () => {
    const h = household()
    const husband = person('Hus', { householdId: h, householdRole: 'husband' })
    const wife = person('Wif', { householdId: h, householdRole: 'wife' })
    const kid = person('Kid2', { householdId: h, householdRole: 'child', isMinor: true })
    expect(lib.loadPersonPage(viewer(husband as never), kid.id)).toMatchObject({ isMinor: true })
    expect(lib.loadPersonPage(viewer(wife as never), kid.id)).toMatchObject({ isMinor: true })
  })

  it('does not show a minor to a grown child of the same household, who is not one of its adults', () => {
    const h = household()
    const grown = person('Grown', { householdId: h, householdRole: 'child' })
    const kid = person('Kid3', { householdId: h, householdRole: 'child', isMinor: true })
    expect(lib.loadPersonPage(viewer(grown as never), kid.id)).toBeNull()
  })

  it('lets a minor with an account open their own page', () => {
    const f = family()
    const page = lib.loadPersonPage(viewer({ id: f.child.id, householdId: f.h, householdRole: 'child' }), f.child.id)!
    expect(page).toMatchObject({ isSelf: true, isMinor: true })
  })

  it('does not make a carer able to see another household’s minor through the shared lookup', () => {
    const f = family()
    const userId = `user-${unique()}`
    db.insert(schema.user).values({ id: userId, name: 'F', email: `${userId}@example.org` }).run()
    db.update(schema.people).set({ userId }).where(orm.eq(schema.people.id, f.father.id)).run()
    expect(peopleLib.findViewerPerson(userId)).toEqual({ id: f.father.id, householdId: f.h, householdRole: 'father' })
    expect(peopleLib.findViewerPerson('nobody')).toBeUndefined()
  })
})

describe('guests and speakers', () => {
  it('shows a listed guest speaker, with only the contact details they shared', () => {
    const g = person('Guest', { kind: 'guest', isSpeaker: true, title: 'Pastor', email: 'g@example.org', phone: '555-0105', shareEmail: true })
    const page = lib.loadPersonPage(MEMBER(), g.id)!
    expect(page).toMatchObject({ kind: 'guest', title: 'Pastor', email: 'g@example.org', ministries: [] })
    expect(page).not.toHaveProperty('phone')
  })

  it('does not show a guest who is not a speaker, or whose speaker listing was archived', () => {
    const plain = person('Plain', { kind: 'guest', isSpeaker: false })
    const archived = person('Gone', { kind: 'guest', isSpeaker: true, speakerArchivedAt: new Date() })
    expect(lib.loadPersonPage(MEMBER(), plain.id)).toBeNull()
    expect(lib.loadPersonPage(MEMBER(), archived.id)).toBeNull()
    expect(lib.loadPersonPage(STAFF, plain.id)).toBeNull()
  })

  it('lists a speaker’s published messages the viewer could open, and never a draft', () => {
    const s = person('Speaker', { isSpeaker: true })
    const msg = (title: string, status: 'draft' | 'published', visibility: 'public' | 'members') =>
      db.insert(schema.sermons).values({ slug: `m-${unique()}`, title, preachedOn: '2026-01-01', speaker: 'Speaker', speakerPersonId: s.id, status, visibility }).run()
    msg('Public one', 'published', 'public')
    msg('Members one', 'published', 'members')
    msg('Secret draft', 'draft', 'members')

    const titles = (viewer: Viewer) => lib.loadPersonPage(viewer, s.id)!.messages.map(m => m.title).sort()
    expect(titles(MEMBER())).toEqual(['Members one', 'Public one'])
    expect(titles(STAFF)).toEqual(['Members one', 'Public one'])
    // The speaker's own page does not list their drafts either: those are on My teaching.
    expect(titles(MEMBER(s.id))).toEqual(['Members one', 'Public one'])
  })

  it('lists no messages for someone who gave none', () => {
    expect(lib.loadPersonPage(MEMBER(), person('Silent').id)!.messages).toEqual([])
  })
})
