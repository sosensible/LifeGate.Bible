// Missions: who may edit, what members see, and what counts as a photo,
// against a real, throwaway SQLite database.
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { missionarySchema, missionUpdateSchema, slugify } from '../../shared/missions'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-missions-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let missions: typeof import('../../server/lib/missions')
let uploads: typeof import('../../server/lib/uploads')
let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  missions = await import('../../server/lib/missions')
  uploads = await import('../../server/lib/uploads')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const addUser = (email: string) =>
  db.insert(schema.user).values({ id: crypto.randomUUID(), name: email, email, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }).returning().get().id

describe('missions editors', () => {
  it('includes people who serve in the Missions ministry, and no one else', async () => {
    const { eq } = await import('drizzle-orm')
    const { setMinistries } = await import('../../server/lib/people')
    const missionsMinistry = db.select().from(schema.ministries).where(eq(schema.ministries.slug, 'missions')).get()!
    const music = db.select().from(schema.ministries).where(eq(schema.ministries.slug, 'music')).get()!

    const serving = addUser('serving@example.org')
    const other = addUser('other@example.org')
    const noPerson = addUser('nobody@example.org')
    const dorothy = db.insert(schema.people).values({ firstName: 'Dorothy', lastName: 'Perkins', userId: serving }).returning().get().id
    const tom = db.insert(schema.people).values({ firstName: 'Tom', lastName: 'Olson', userId: other }).returning().get().id
    db.transaction((tx) => {
      setMinistries(tx, dorothy, [missionsMinistry.id])
      setMinistries(tx, tom, [music.id])
    })

    expect(missions.servesInMissionsMinistry(serving)).toBe(true)
    expect(missions.servesInMissionsMinistry(other)).toBe(false)
    expect(missions.servesInMissionsMinistry(noPerson)).toBe(false)
  })
})

describe('missionary contact details', () => {
  it('reach members only when shared, and editors always', () => {
    db.insert(schema.missionaries).values([
      { slug: 'shared', kind: 'family', name: 'Shared Family', email: 'shared@example.org', phone: '555-0100', shareContact: true },
      { slug: 'private', kind: 'individual', name: 'Private Person', email: 'private@example.org', mailingAddress: 'PO Box 1', shareContact: false },
    ]).run()

    const shared = missions.loadMissionaries({ canEdit: false, slug: 'shared' })[0]!
    expect(shared.email).toBe('shared@example.org')

    const hidden = missions.loadMissionaries({ canEdit: false, slug: 'private' })[0]!
    expect(hidden).not.toHaveProperty('email')
    expect(hidden).not.toHaveProperty('mailingAddress')
    expect(JSON.stringify(hidden)).not.toContain('private@example.org')

    expect(missions.loadMissionaries({ canEdit: true, slug: 'private' })[0]!.email).toBe('private@example.org')
  })

  it('gives each entry its own link, never "organizations"', () => {
    expect(missions.uniqueSlug(schema.missionaries, 'Shared')).toBe('shared-2')
    expect(missions.uniqueSlug(schema.missionaries, 'Organizations')).toBe('organizations-2')
    expect(slugify('Tom & Anna Reyes')).toBe('tom-anna-reyes')
  })
})

describe('photos', () => {
  const jpeg = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0])
  const png = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0])
  const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')

  it('are recognized by their contents, not their names', () => {
    expect(uploads.detectPhotoType(jpeg)).toBe('jpg')
    expect(uploads.detectPhotoType(png)).toBe('png')
    expect(uploads.detectPhotoType(webp)).toBe('webp')
    expect(uploads.detectPhotoType(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toBeNull()
    expect(uploads.detectPhotoType(new TextEncoder().encode('<html><script></script>'))).toBeNull()
  })

  it('are saved outside the public folder and refused when not a photo', () => {
    const name = uploads.savePhoto(jpeg)
    expect(name).toMatch(/^[0-9a-f-]{36}\.jpg$/)
    expect(existsSync(join(dir, 'uploads', name))).toBe(true)
    expect(() => uploads.savePhoto(new TextEncoder().encode('GIF89a'))).toThrow(/JPEG, PNG or WebP/)
    uploads.deletePhoto(name)
    expect(existsSync(join(dir, 'uploads', name))).toBe(false)
  })

  it('only accept stored photo names and web links in entries', () => {
    const base = { kind: 'family', name: 'X', photo: null, writeup: null, familyNames: null, field: null, focus: null, organizationId: null, status: 'onField', startedYear: null, supportUrl: null, email: null, phone: null, mailingAddress: null, website: null, shareContact: false, nextVisitOn: null, nextVisitNote: null }
    expect(missionarySchema.safeParse(base).success).toBe(true)
    expect(missionarySchema.safeParse({ ...base, photo: '../../.env' }).success).toBe(false)
    expect(missionarySchema.safeParse({ ...base, supportUrl: 'javascript:alert(1)' }).success).toBe(false)
    expect(missionUpdateSchema.safeParse({ kind: 'prayer', postedOn: '2026-09-01', title: null, body: null, url: null }).success).toBe(false)
  })
})
