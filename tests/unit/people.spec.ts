// Directory records against a real, throwaway SQLite database with every migration applied.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { personSchema, profileUpdateSchema } from '../../shared/people'
import { MEMBER_VIEW, presentPerson } from '../../shared/privacy'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-people-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

type Lib = typeof import('../../server/lib/people')
let lib: Lib
let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')

let personId = ''
let nurseryId = ''
let musicId = ''

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/people')

  const all = db.select().from(schema.ministries).all()
  nurseryId = all.find(m => m.slug === 'nursery')!.id
  musicId = all.find(m => m.slug === 'music')!.id

  const household = db.insert(schema.households).values({ name: 'Perkins Household' }).returning().get()
  personId = db.insert(schema.people).values({
    firstName: 'Dorothy', lastName: 'Perkins', householdId: household.id,
    phone: '(269) 555-0105', birthday: '1948-08-30', photoUrl: '/p.jpg',
  }).returning().get().id
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('database setup', () => {
  it('seeds the church ministries with every new database', () => {
    const slugs = db.select().from(schema.ministries).all().map(m => m.slug)
    expect(slugs).toHaveLength(19)
    expect(slugs).toContain('it-information-technology')
    expect(slugs).toContain('grounds-facilities')
  })
})

describe('people records', () => {
  it('starts with nothing shared', () => {
    const person = lib.loadPerson(personId)!
    expect(presentPerson(person, MEMBER_VIEW)).toEqual({ id: personId, firstName: 'Dorothy', lastName: 'Perkins' })
  })

  it('replaces ministry service rather than adding to it', () => {
    db.transaction(tx => lib.setMinistries(tx, personId, [nurseryId, musicId, nurseryId]))
    expect(lib.loadPerson(personId)!.ministries.map(m => m.slug)).toEqual(['music', 'nursery'])

    db.transaction(tx => lib.setMinistries(tx, personId, [musicId]))
    expect(lib.loadPerson(personId)!.ministries.map(m => m.slug)).toEqual(['music'])
  })

  it('shows staff the household but not an unshared birthday or photo, or that one exists', () => {
    const view = lib.presentForAdmin(lib.loadPerson(personId)!)
    expect(view.householdName).toBe('Perkins Household')
    expect(view.phone).toBe('(269) 555-0105')
    expect(view.birthday).toBeNull()
    expect(view.photoUrl).toBeNull()
    expect(JSON.stringify(view)).not.toContain('1948')
    expect(JSON.stringify(view)).not.toMatch(/hasBirthday|hasPhoto/)
  })

  it('refuses staff changes to a birthday they cannot see', () => {
    const person = lib.loadPerson(personId)!
    expect(() => lib.assertStaffCanReview(person, ['phone', 'birthday'])).toThrow(/only they can change it/)
    expect(() => lib.assertStaffCanReview(person, ['phone'])).not.toThrow()
    expect(() => lib.assertStaffCanReview({ ...person, shareBirthday: true }, ['birthday'])).not.toThrow()
  })

  it('rejects references to households or ministries that do not exist', () => {
    expect(() => lib.assertReferencesExist({ householdId: 'missing' })).toThrow(/household/)
    expect(() => lib.assertReferencesExist({ ministryIds: [musicId, 'missing'] })).toThrow(/ministries/)
    expect(() => lib.assertReferencesExist({ ministryIds: [musicId, musicId] })).not.toThrow()
  })

  it('records which fields changed in the audit log, never their values', () => {
    const now = new Date()
    const actor = db.insert(schema.user).values({ id: 'staff-1', name: 'Staff', email: 'staff@example.org', emailVerified: true, createdAt: now, updatedAt: now }).returning().get()
    lib.recordAudit(db, { actorUserId: actor.id, action: 'person.update', entityType: 'person', entityId: personId, fields: ['phone'] })

    const [entry] = db.select().from(schema.auditLog).all()
    expect(entry).toMatchObject({ actorUserId: 'staff-1', action: 'person.update', entityId: personId, details: { fields: ['phone'] } })
    expect(JSON.stringify(entry)).not.toContain('555')
  })
})

describe('validation', () => {
  it('accepts a birthday only as a full date', () => {
    expect(profileUpdateSchema.safeParse({ birthday: '1961-09-03' }).success).toBe(true)
    expect(profileUpdateSchema.safeParse({ birthday: '' }).success).toBe(true)
    expect(profileUpdateSchema.safeParse({ birthday: 'September 3' }).success).toBe(false)
  })

  it('does not let a profile update change names or ministries', () => {
    const parsed = profileUpdateSchema.parse({ phone: '555', firstName: 'Someone Else', ministryIds: ['x'] })
    expect(parsed).toEqual({ phone: '555' })
  })

  it('does not accept a birthday when staff create a person', () => {
    const base = { firstName: 'Dorothy', lastName: 'Perkins', title: null, isMinor: false, householdId: null, ministryIds: [], phone: null, email: null, address: null }
    expect(personSchema.parse({ ...base, birthday: '1948-08-30' })).not.toHaveProperty('birthday')
  })

  it('requires a first and last name for a person', () => {
    const base = { title: null, isMinor: false, householdId: null, ministryIds: [], phone: null, email: null, address: null }
    expect(personSchema.safeParse({ ...base, firstName: ' ', lastName: 'Perkins' }).success).toBe(false)
    expect(personSchema.safeParse({ ...base, firstName: 'Dorothy', lastName: 'Perkins' }).success).toBe(true)
  })
})
