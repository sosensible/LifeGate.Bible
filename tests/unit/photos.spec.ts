// Photos of people and households, against a throwaway database and a throwaway
// uploads folder: nothing here is ever written inside the repository.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Viewer } from '../../shared/privacy'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-photos-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.UPLOADS_PATH = join(dir, 'uploads')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let photos: typeof import('../../server/lib/photos')
let uploads: typeof import('../../server/lib/uploads')
let pageLib: typeof import('../../server/lib/person-page')
let householdsLib: typeof import('../../server/lib/households')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  photos = await import('../../server/lib/photos')
  uploads = await import('../../server/lib/uploads')
  pageLib = await import('../../server/lib/person-page')
  householdsLib = await import('../../server/lib/households')
  orm = await import('drizzle-orm')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46, 0])
const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])
const filesOnDisk = () => (existsSync(process.env.UPLOADS_PATH!) ? readdirSync(process.env.UPLOADS_PATH!) : [])
const nameOf = (url: string) => photos.photoNameOf(url)!

let n = 0
const person = (first: string, extra: Partial<typeof schema.people.$inferInsert> = {}) =>
  db.insert(schema.people).values({ firstName: first, lastName: `P${++n}`, ...extra }).returning().get()
const household = () => db.insert(schema.households).values({ name: `H${++n}`, kind: 'married' }).returning().get().id
const photoOf = (id: string) => db.select({ u: schema.people.photoUrl }).from(schema.people).where(orm.eq(schema.people.id, id)).get()!.u

const MEMBER: Viewer = { isMember: true, isStaff: false, personId: 'someone-else' }
const STAFF_VIEWER: Viewer = { isMember: true, isStaff: true, personId: 'someone-else' }

describe('where photos are kept', () => {
  it('writes the file under the uploads folder, never inside the repository or its public folder', () => {
    const p = person('Kept')
    const url = photos.setPersonPhoto(p.id, JPEG)
    const file = join(process.env.UPLOADS_PATH!, nameOf(url))
    expect(existsSync(file)).toBe(true)
    expect(resolve(file).startsWith(resolve(process.cwd()))).toBe(false)
    expect(existsSync(join(process.cwd(), 'public', nameOf(url)))).toBe(false)
    expect(url).toMatch(/^\/api\/photos\/[0-9a-f-]{36}\.jpg$/)
  })

  it('keeps the uploads folder out of git and out of the docker image', async () => {
    const { readFileSync } = await import('node:fs')
    const lines = (file: string) => readFileSync(file, 'utf8').split('\n').map(line => line.trim())
    expect(lines('.gitignore')).toContain('.data')
    expect(lines('.dockerignore')).toContain('.data')
  })
})

describe('setting, replacing and removing a photo', () => {
  it('keeps only the current photo: a replacement deletes the old file', () => {
    const p = person('Replaced')
    const first = photos.setPersonPhoto(p.id, JPEG)
    const second = photos.setPersonPhoto(p.id, PNG)
    expect(second).not.toBe(first)
    expect(photoOf(p.id)).toBe(second)
    expect(existsSync(join(process.env.UPLOADS_PATH!, nameOf(first)))).toBe(false)
    expect(existsSync(join(process.env.UPLOADS_PATH!, nameOf(second)))).toBe(true)
  })

  it('removes the file and the link together', () => {
    const p = person('Removed')
    const url = photos.setPersonPhoto(p.id, JPEG)
    photos.clearPersonPhoto(p.id)
    expect(photoOf(p.id)).toBeNull()
    expect(existsSync(join(process.env.UPLOADS_PATH!, nameOf(url)))).toBe(false)
  })

  it('does the same for a household', () => {
    const h = household()
    const first = photos.setHouseholdPhoto(h, JPEG)
    const second = photos.setHouseholdPhoto(h, PNG)
    expect(existsSync(join(process.env.UPLOADS_PATH!, nameOf(first)))).toBe(false)
    expect(householdsLib.loadHousehold(h)!.photoUrl).toBe(second)
    photos.clearHouseholdPhoto(h)
    expect(householdsLib.loadHousehold(h)!.photoUrl).toBeNull()
    expect(existsSync(join(process.env.UPLOADS_PATH!, nameOf(second)))).toBe(false)
  })

  it('refuses a file that is not a photo whatever its name, and one that is too big, saving nothing', () => {
    const p = person('Refused')
    const before = filesOnDisk().length
    const html = new TextEncoder().encode('<script>alert(1)</script>')
    expect(() => photos.setPersonPhoto(p.id, html)).toThrow(/JPEG, PNG or WebP/)
    expect(() => photos.setPersonPhoto(p.id, new Uint8Array(uploads.MAX_PHOTO_BYTES + 1))).toThrow(/5 MB/)
    expect(filesOnDisk().length).toBe(before)
    expect(photoOf(p.id)).toBeNull()
  })

  it('is a 404 for someone who is not in the directory', () => {
    expect(() => photos.setPersonPhoto('nobody', JPEG)).toThrow(/not found/i)
    expect(() => photos.setHouseholdPhoto('nobody', JPEG)).toThrow(/not found/i)
  })

  it('only treats the site’s own address as a stored photo', () => {
    expect(photos.photoNameOf('/api/photos/abc.jpg')).toBe('abc.jpg')
    expect(photos.photoNameOf('https://elsewhere.example/abc.jpg')).toBeNull()
    expect(photos.photoNameOf(null)).toBeNull()
  })
})

describe('who may be sent a person’s photo', () => {
  const subject = (extra: Partial<typeof schema.people.$inferInsert> = {}) => {
    const p = person('Subject', extra)
    const url = photos.setPersonPhoto(p.id, JPEG)
    return { p, name: nameOf(url) }
  }

  it('lets the person see their own photo before they share it, to decide', () => {
    const { p, name } = subject({ sharePhoto: false })
    expect(photos.canViewPhoto({ ...MEMBER, personId: p.id }, false, name)).toBe(true)
  })

  it('hides an unshared photo from every other member and from staff who only read the directory', () => {
    const { name } = subject({ sharePhoto: false })
    expect(photos.canViewPhoto(MEMBER, false, name)).toBe(false)
    expect(photos.canViewPhoto(STAFF_VIEWER, false, name)).toBe(false)
  })

  it('lets the staff who set photos see what they set, shared or not', () => {
    const { name } = subject({ sharePhoto: false })
    expect(photos.canViewPhoto(STAFF_VIEWER, true, name)).toBe(true)
  })

  it('shows a shared photo to members, and to no one who is not a member', () => {
    const { name } = subject({ sharePhoto: true })
    expect(photos.canViewPhoto(MEMBER, false, name)).toBe(true)
    expect(photos.canViewPhoto({ isMember: false, isStaff: false, personId: null }, false, name)).toBe(false)
  })

  it('does not show a shared minor’s photo to other members, only to the household’s adults and staff', () => {
    const h = household()
    const child = person('Kid', { isMinor: true, householdId: h, householdRole: 'child', sharePhoto: true })
    const name = nameOf(photos.setPersonPhoto(child.id, JPEG))
    expect(photos.canViewPhoto(MEMBER, false, name)).toBe(false)
    expect(photos.canViewPhoto({ ...MEMBER, householdId: h, householdRole: 'mother' }, false, name)).toBe(true)
    expect(photos.canViewPhoto({ ...MEMBER, householdId: h, householdRole: 'child' }, false, name)).toBe(false)
    expect(photos.canViewPhoto(STAFF_VIEWER, false, name)).toBe(true)
  })

  it('knows nothing of a name that is not a stored photo', () => {
    expect(photos.canViewPhoto(MEMBER, true, '00000000-0000-0000-0000-000000000000.jpg')).toBe(false)
  })
})

describe('who may be sent a household’s photo, and when the page shows it', () => {
  const family = (sharing: boolean) => {
    const h = household()
    const mother = person('Mum', { householdId: h, householdRole: 'wife', shareHousehold: sharing })
    const name = nameOf(photos.setHouseholdPhoto(h, JPEG))
    return { h, mother, name }
  }

  it('is not shown to members when nobody in the household shares it', () => {
    const f = family(false)
    expect(photos.canViewPhoto(MEMBER, false, f.name)).toBe(false)
    expect(pageLib.loadPersonPage(MEMBER, f.mother.id)).not.toHaveProperty('householdPhotoUrl')
  })

  it('is shown to members once someone in the household shares it, and on that person’s page', () => {
    const f = family(true)
    expect(photos.canViewPhoto(MEMBER, false, f.name)).toBe(true)
    expect(pageLib.loadPersonPage(MEMBER, f.mother.id)).toHaveProperty('householdPhotoUrl', `/api/photos/${f.name}`)
  })

  it('is always there for the household’s own members and for staff who keep the record', () => {
    const f = family(false)
    expect(photos.canViewPhoto({ ...MEMBER, householdId: f.h, householdRole: 'wife' }, false, f.name)).toBe(true)
    expect(photos.canViewPhoto(STAFF_VIEWER, true, f.name)).toBe(true)
    // And on your own page, even when you do not share it.
    expect(pageLib.loadPersonPage({ ...MEMBER, personId: f.mother.id }, f.mother.id)).toHaveProperty('householdPhotoUrl')
  })

  it('does not reach a member of another household, and not a non-member', () => {
    const f = family(false)
    expect(photos.canViewPhoto({ ...MEMBER, householdId: 'another', householdRole: 'father' }, false, f.name)).toBe(false)
    expect(photos.canViewPhoto({ isMember: false, isStaff: false, personId: null }, false, f.name)).toBe(false)
  })
})

describe('only requests from this site', () => {
  const ask = (request: Parameters<typeof photos.isFromThisSite>[0]) => photos.isFromThisSite(request)

  it('answers a request a browser says came from this same site', () => {
    expect(ask({ secFetchSite: 'same-origin' })).toBe(true)
  })

  it('refuses another site embedding it, a link from a related site, and an address typed in', () => {
    for (const secFetchSite of ['cross-site', 'same-site', 'none']) expect(ask({ secFetchSite, referer: 'https://lifegate.bible/', host: 'lifegate.bible' })).toBe(false)
  })

  it('judges a browser that sends no fetch metadata by who referred it', () => {
    expect(ask({ referer: 'https://lifegate.bible/people/1', host: 'lifegate.bible' })).toBe(true)
    expect(ask({ referer: 'https://elsewhere.example/page', host: 'lifegate.bible' })).toBe(false)
    expect(ask({ referer: null, host: 'lifegate.bible' })).toBe(false)
    expect(ask({ referer: 'not a url', host: 'lifegate.bible' })).toBe(false)
    expect(ask({})).toBe(false)
  })
})
