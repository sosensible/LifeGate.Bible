// The church's own details: who may change them, what they must look like, where
// they take effect, and the logo's rules. Against a throwaway database and a
// throwaway uploads folder: nothing here is written inside the repository.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { roles } from '../../shared/auth/permissions'
import { SITE_DEFAULTS, addressLines, cityLine, clock12, contactPhrase, serviceShown, serviceTimeLine, siteSchema } from '../../shared/site'
import { ICON_SIZES, LOGO_PART_NAMES, LOGO_WIDTHS, iconPartName, iconSrc, logoPartName, logoSrc } from '../../shared/site-logo'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-site-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.UPLOADS_PATH = join(dir, 'uploads')

let db: typeof import('../../server/lib/db').db
let site: typeof import('../../server/lib/site')
let logo: typeof import('../../server/lib/site-logo')
let mail: typeof import('../../server/lib/mail')
let statements: typeof import('../../server/lib/statements')
let manifest: typeof import('../../server/lib/site-manifest')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  site = await import('../../server/lib/site')
  logo = await import('../../server/lib/site-logo')
  mail = await import('../../server/lib/mail')
  statements = await import('../../server/lib/statements')
  manifest = await import('../../server/lib/site-manifest')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))
afterEach(() => vi.unstubAllEnvs())

const valid = {
  name: 'Grace Community Church',
  shortName: 'Grace',
  description: 'A church in Springfield',
  street: '12 Elm Street',
  city: 'Springfield',
  region: 'Ohio',
  postalCode: '45501',
  phone: '(937) 555-0100',
  contactEmail: 'office@grace.example',
  serviceTimes: [{ weekday: 0, time: '10:30', label: 'Worship', note: '', onCalendar: true }],
}

// A PNG's first 24 bytes: signature, then the IHDR chunk that carries the size.
const png = (width: number, height: number) => {
  const bytes = new Uint8Array(32)
  bytes.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

const goodSet = (ratio = 1) => {
  const files: Record<string, Uint8Array> = {}
  for (const w of LOGO_WIDTHS) files[logoPartName(w)] = png(w, Math.round(w * ratio))
  for (const s of ICON_SIZES) files[iconPartName(s)] = png(s, s)
  return files
}

const uploaded = () => (existsSync(join(process.env.UPLOADS_PATH!, 'site')) ? readdirSync(join(process.env.UPLOADS_PATH!, 'site')) : [])

describe('who may change the church’s details', () => {
  const may = (role: keyof typeof roles) => roles[role].authorize({ siteSettings: ['update'] } as never).success

  it('is the administrator and the church secretary', () => {
    expect(may('admin')).toBe(true)
    expect(may('churchSecretary')).toBe(true)
  })

  it.each(['user', 'member', 'contentEditor', 'directoryManager', 'pastor', 'treasurer', 'counter', 'financeCommittee', 'deacon', 'searchCommittee'] as const)(
    'is not %s',
    role => expect(may(role)).toBe(false),
  )
})

describe('what the details must look like', () => {
  it('takes a complete set', () => {
    expect(siteSchema.parse(valid)).toEqual(valid)
  })

  it.each([['name', ''], ['name', '   '], ['shortName', ''], ['contactEmail', 'not-an-address']])('refuses %s of %j', (field, value) => {
    expect(siteSchema.safeParse({ ...valid, [field]: value }).success).toBe(false)
  })

  it('lets the email, phone and address be left empty', () => {
    expect(siteSchema.safeParse({ ...valid, contactEmail: '', phone: '', street: '', serviceTimes: [] }).success).toBe(true)
  })

  it('limits the length of what is stored and shown', () => {
    expect(siteSchema.safeParse({ ...valid, name: 'x'.repeat(81) }).success).toBe(false)
    expect(siteSchema.safeParse({ ...valid, description: 'x'.repeat(161) }).success).toBe(false)
    expect(siteSchema.safeParse({ ...valid, serviceTimes: Array.from({ length: 9 }, () => valid.serviceTimes[0]) }).success).toBe(false)
  })

  it('needs each service to be named and timed', () => {
    expect(siteSchema.safeParse({ ...valid, serviceTimes: [{ weekday: 0, label: '', time: '10:00', note: '', onCalendar: true }] }).success).toBe(false)
    expect(siteSchema.safeParse({ ...valid, serviceTimes: [{ weekday: 0, label: 'Worship', time: '', note: '', onCalendar: true }] }).success).toBe(false)
  })

  it('needs a real weekday, a 24-hour time and a calendar choice', () => {
    const row = valid.serviceTimes[0]!
    for (const bad of [{ weekday: 7 }, { weekday: -1 }, { weekday: 1.5 }, { time: '25:00' }, { time: '9:00' }, { time: '10:00 AM' }, { onCalendar: 'yes' }]) {
      expect(siteSchema.safeParse({ ...valid, serviceTimes: [{ ...row, ...bad }] }).success).toBe(false)
    }
  })

  it('writes the address and service lines the pages print', () => {
    expect(cityLine(valid)).toBe('Springfield, Ohio 45501')
    expect(addressLines(valid)).toEqual(['12 Elm Street', 'Springfield, Ohio 45501'])
    expect(addressLines({ ...SITE_DEFAULTS })).toEqual([])
    expect(serviceTimeLine(serviceShown({ weekday: 0, time: '13:30', label: 'Worship', note: 'Main', onCalendar: true }))).toBe('Sun 1:30 PM — Worship (Main)')
    expect(clock12('00:05')).toBe('12:05 AM')
    expect(clock12('12:00')).toBe('12:00 PM')
    expect(contactPhrase({ contactEmail: '' })).toBe('the church office')
  })
})

describe('what ships with the site', () => {
  // The code is reused by other churches; it must not carry ours.
  it('starts as nobody’s church', () => {
    const fresh = site.loadSite()
    expect(fresh).toMatchObject({ name: 'Your Church Name', logoVersion: 0, serviceTimes: [] })
    expect(JSON.stringify(fresh)).not.toMatch(/lifegate|eau claire/i)
    expect(JSON.stringify(SITE_DEFAULTS)).not.toMatch(/lifegate|eau claire/i)
  })

  it('shows the built-in mark until a logo is uploaded', () => {
    expect(logoSrc(432, 0)).toBe('/images/logo-432.png')
    expect(iconSrc(192, 0)).toBe('/icon-192.png')
    expect(logoSrc(432, 7)).toBe('/site/logo/432.png?v=7')
    expect(iconSrc(192, 7)).toBe('/site/icon/192.png?v=7')
  })

  it('does not name a church in the giving-statement seed', () => {
    expect(statements.loadStatementSettings().legalName).not.toMatch(/lifegate/i)
  })
})

describe('changing the details', () => {
  it('records which fields changed, and nothing when nothing did', () => {
    const changed = db.transaction(tx => site.updateSite(tx, siteSchema.parse(valid)))
    expect(changed).toEqual(expect.arrayContaining(['name', 'shortName', 'contactEmail', 'serviceTimes']))
    expect(site.loadSite()).toMatchObject(valid)
    expect(db.transaction(tx => site.updateSite(tx, siteSchema.parse(valid)))).toEqual([])
  })

  it('sends the contact form to the edited address, falling back to the server’s', () => {
    vi.stubEnv('CONTACT_EMAIL', 'fallback@example.org')
    expect(site.officeEmail()).toBe('office@grace.example')
    db.transaction(tx => site.updateSite(tx, siteSchema.parse({ ...valid, contactEmail: '' })))
    expect(site.officeEmail()).toBe('fallback@example.org')
    vi.stubEnv('CONTACT_EMAIL', '')
    expect(site.officeEmail()).toBeNull()
    db.transaction(tx => site.updateSite(tx, siteSchema.parse(valid)))
  })

  it('puts the edited name on the mail the church sends', () => {
    vi.stubEnv('MAIL_FROM', '')
    vi.stubEnv('MAIL_FROM_ADDRESS', 'no-reply@grace.example')
    expect(mail.mailFrom()).toBe('"Grace Community Church" <no-reply@grace.example>')
    expect(mail.renderActionEmail({ heading: 'h', intro: 'i', actionLabel: 'a', actionUrl: 'https://x.example', footnote: 'f' }).html).toContain('Grace Community Church')
  })

  it('cannot let a name break the sender header', () => {
    vi.stubEnv('MAIL_FROM', '')
    vi.stubEnv('MAIL_FROM_ADDRESS', 'no-reply@grace.example')
    db.transaction(tx => site.updateSite(tx, siteSchema.parse({ ...valid, name: 'Grace "The <Best>" Church' })))
    expect(mail.mailFrom()).toBe('"Grace The Best Church" <no-reply@grace.example>')
    db.transaction(tx => site.updateSite(tx, siteSchema.parse(valid)))
  })

  it('names the phone app after the church', () => {
    const made = manifest.buildManifest(site.loadSite())
    expect(made).toMatchObject({ name: 'Grace Community Church', short_name: 'Grace' })
    expect(made.icons.map(i => i.src)).toEqual(['/icon-192.png', '/icon-512.png', '/icon-512.png'])
  })

  // The treasurer's legal name is its own record (the seeded row is a placeholder
  // she replaces); the site's name only stands in if that row is ever missing.
  it('does not change a giving statement’s legal name when the site is renamed', () => {
    expect(statements.loadStatementSettings().legalName).toBe('Your church’s legal name')
  })
})

describe('the logo', () => {
  it('keeps nothing and shows the built-in mark until one is uploaded', () => {
    expect(site.loadSite().logoVersion).toBe(0)
    expect(logo.readLogoFile(logoPartName(432))).toBeNull()
    expect(uploaded()).toEqual([])
  })

  it('stores a complete set under a version, and serves each file', () => {
    const version = logo.saveLogoSet(goodSet(0.75))
    expect(site.loadSite()).toMatchObject({ logoVersion: version, logoWidth: 864, logoHeight: 648 })
    expect(uploaded()).toEqual([String(version)])
    for (const name of LOGO_PART_NAMES) expect(logo.readLogoFile(name)?.length).toBeGreaterThan(0)
    expect(logo.readLogoFile('../../etc/passwd')).toBeNull()
    expect(manifest.buildManifest(site.loadSite()).icons[0]!.src).toBe(`/site/icon/192.png?v=${version}`)
  })

  it('deletes the old set when it is replaced, and never reuses a version', () => {
    const before = site.loadSite().logoVersion
    const after = logo.saveLogoSet(goodSet(1))
    expect(after).toBeGreaterThan(before)
    expect(uploaded()).toEqual([String(after)])
  })

  it('refuses a set with a file missing, and changes nothing', () => {
    const before = site.loadSite().logoVersion
    const files = goodSet()
    delete files[iconPartName(512)]
    expect(() => logo.saveLogoSet(files)).toThrow(/incomplete/)
    expect(site.loadSite().logoVersion).toBe(before)
    expect(uploaded()).toEqual([String(before)])
  })

  it('refuses a file that is not a PNG', () => {
    const files = goodSet()
    files[logoPartName(432)] = new TextEncoder().encode('<svg onload="alert(1)"></svg>'.padEnd(40))
    expect(() => logo.saveLogoSet(files)).toThrow(/PNG/)
  })

  it('refuses an icon that is not the size its name says', () => {
    const files = goodSet()
    files[iconPartName(192)] = png(64, 64)
    expect(() => logo.saveLogoSet(files)).toThrow(/sizes/)
  })

  it('refuses page sizes that are not the same picture', () => {
    const files = goodSet()
    files[logoPartName(216)] = png(216, 20)
    expect(() => logo.saveLogoSet(files)).toThrow(/do not match/)
  })

  it('refuses a set that is too large', () => {
    const files = goodSet()
    const big = new Uint8Array(logo.MAX_LOGO_FILE_BYTES + 1)
    big.set(png(864, 864))
    files[logoPartName(864)] = big
    expect(() => logo.saveLogoSet(files)).toThrow(/too large/)
  })

  it('goes back to the built-in mark when removed, leaving no files behind', () => {
    logo.clearLogo()
    expect(site.loadSite().logoVersion).toBe(0)
    expect(uploaded()).toEqual([])
    expect(logo.readLogoFile(logoPartName(432))).toBeNull()
  })

  it('falls back to the built-in mark when the files have gone missing', () => {
    logo.saveLogoSet(goodSet())
    rmSync(join(process.env.UPLOADS_PATH!, 'site'), { recursive: true })
    expect(logo.readLogoFile(iconPartName(48))).toBeNull()
    logo.clearLogo()
  })

  it('reads a PNG’s size from its header, and nothing else', () => {
    expect(logo.pngSize(png(300, 200))).toEqual({ width: 300, height: 200 })
    expect(logo.pngSize(new Uint8Array(40))).toBeNull()
    expect(logo.pngSize(new Uint8Array([0x89, 0x50]))).toBeNull()
  })
})
