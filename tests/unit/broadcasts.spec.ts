// Shared broadcasts: who may open the locked watching page, and how many people in total.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { broadcastAvailability, broadcastSchema, CODE_ALPHABET, embedUrlFor, formatCode, isValidStreamUrl, looksLikeCode, normalizeCode } from '../../shared/broadcast'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-broadcasts-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let lib: typeof import('../../server/lib/broadcasts')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/broadcasts')
  orm = await import('drizzle-orm')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let n = 0
const NOW = new Date('2026-11-08T15:00:00Z')
const account = () => {
  const now = new Date()
  return db.insert(schema.user).values({ id: `bc-u-${++n}`, name: 'Admin', email: `bc${n}@example.org`, emailVerified: true, createdAt: now, updatedAt: now }).returning().get().id
}
const make = (over: Partial<typeof schema.broadcasts.$inferInsert> = {}) =>
  db.insert(schema.broadcasts).values({ slug: `bc-${++n}`, title: `Broadcast ${n}`, streamUrl: 'https://stream.example/watch/abc', audience: 'members', isOpen: true, ...over }).returning().get()
const statusOf = (fn: () => unknown) => { try { fn() } catch (error) { return (error as { statusCode?: number }).statusCode } return undefined }

describe('when a broadcast is open', () => {
  const at = (iso: string) => new Date(iso)
  it('is open only while the switch is on and the dates, if any, allow it', () => {
    expect(broadcastAvailability({ isOpen: true, opensAt: null, closesAt: null }, NOW)).toBe('open')
    expect(broadcastAvailability({ isOpen: false, opensAt: null, closesAt: null }, NOW)).toBe('not-open')
    expect(broadcastAvailability({ isOpen: true, opensAt: at('2026-11-08T16:00:00Z'), closesAt: null }, NOW)).toBe('not-open')
    expect(broadcastAvailability({ isOpen: true, opensAt: at('2026-11-08T14:00:00Z'), closesAt: at('2026-11-08T16:00:00Z') }, NOW)).toBe('open')
  })

  it('is closed once its end time has passed, even with the switch still on', () => {
    expect(broadcastAvailability({ isOpen: true, opensAt: null, closesAt: at('2026-11-08T15:00:00Z') }, NOW)).toBe('closed')
    expect(broadcastAvailability({ isOpen: false, opensAt: null, closesAt: at('2026-11-08T14:00:00Z') }, NOW)).toBe('closed')
  })
})

describe('codes and addresses', () => {
  it('writes a code in two groups, and reads back whatever way it was typed', () => {
    expect(formatCode('ACDEFGHJKM')).toBe('ACDEF-GHJKM')
    expect(normalizeCode(' acdef - ghjkm ')).toBe('ACDEFGHJKM')
    expect(looksLikeCode('acdef-ghjkm')).toBe(true)
  })

  it('does not accept something that could not be a code', () => {
    for (const bad of ['', 'ACDEF', 'ACDEF-GHJKM-X', 'ACDEF-GHJK0', 'ACDEF GHJK!']) expect(looksLikeCode(bad)).toBe(false)
  })

  it('makes codes from letters that cannot be mistaken for each other', () => {
    expect(CODE_ALPHABET).not.toMatch(/[0OIL1BSZ258]/)
    const codes = new Set(Array.from({ length: 200 }, () => lib.generateCode()))
    expect(codes.size).toBe(200)
    for (const code of codes) expect(looksLikeCode(code)).toBe(true)
  })

  it('takes only an https stream address, and puts an id for the viewer where asked', () => {
    expect(isValidStreamUrl('https://stream.example/watch/abc')).toBe(true)
    expect(isValidStreamUrl('https://stream.example/watch?viewer={viewer}')).toBe(true)
    for (const bad of ['http://stream.example/x', 'stream.example/x', 'javascript:alert(1)', '', 'https://' + 'x'.repeat(600) + '.example']) expect(isValidStreamUrl(bad)).toBe(false)
    expect(embedUrlFor('https://s.example/w?v={viewer}&t={viewer}', 'a b')).toBe('https://s.example/w?v=a%20b&t=a%20b')
  })

  it('checks what an administrator enters', () => {
    const ok = { title: 'Christmas service', streamUrl: 'https://s.example/w', audience: 'members' as const, isOpen: false }
    expect(broadcastSchema.safeParse(ok).success).toBe(true)
    expect(broadcastSchema.safeParse({ ...ok, title: '' }).success).toBe(false)
    expect(broadcastSchema.safeParse({ ...ok, streamUrl: 'http://s.example' }).success).toBe(false)
    expect(broadcastSchema.safeParse({ ...ok, maxViewers: 0 }).success).toBe(false)
    expect(broadcastSchema.safeParse({ ...ok, maxViewers: 150 }).success).toBe(true)
    expect(broadcastSchema.safeParse({ ...ok, audience: 'everyone' }).success).toBe(false)
    expect(broadcastSchema.safeParse({ ...ok, opensAt: '2026-11-08T18:00:00Z', closesAt: '2026-11-08T17:00:00Z' }).success).toBe(false)
    expect(broadcastSchema.safeParse({ ...ok, opensAt: '2026-11-08T17:00:00Z', closesAt: '2026-11-08T18:00:00Z' }).success).toBe(true)
  })
})

describe('seats', () => {
  it('lets people in until the limit, counting members and guests together', () => {
    const b = make({ maxViewers: 2, audience: 'members_and_guests' })
    expect(lib.admit(b, lib.memberKey('m1'), NOW)).toBe('ok')
    expect(lib.admit(b, lib.passKey('g1'), NOW)).toBe('ok')
    expect(lib.admit(b, lib.memberKey('m2'), NOW)).toBe('full')
    expect(lib.admit(b, lib.passKey('g2'), NOW)).toBe('full')
    expect(lib.seatsTaken(b.id)).toBe(2)
  })

  it('applies to a member just the same: no code is needed, but the limit still holds', () => {
    const b = make({ maxViewers: 1 })
    expect(lib.admit(b, lib.memberKey('first'), NOW)).toBe('ok')
    expect(lib.admit(b, lib.memberKey('second'), NOW)).toBe('full')
  })

  it('lets someone who already has a seat back in, even when it is full', () => {
    const b = make({ maxViewers: 1 })
    lib.admit(b, lib.memberKey('m1'), NOW)
    expect(lib.admit(b, lib.memberKey('m1'), NOW)).toBe('ok')
    expect(lib.seatsTaken(b.id)).toBe(1)
  })

  it('has no limit unless one is set', () => {
    const b = make({ maxViewers: null })
    for (let i = 0; i < 50; i++) expect(lib.admit(b, lib.memberKey(`m${i}`), NOW)).toBe('ok')
    expect(lib.seatsTaken(b.id)).toBe(50)
  })

  it('gives out no seats while the broadcast is not open or is closed, and not to someone who already had one', () => {
    const b = make({ isOpen: false })
    expect(lib.admit(b, lib.memberKey('m1'), NOW)).toBe('not-open')
    expect(lib.seatsTaken(b.id)).toBe(0)
    const closed = make({ closesAt: new Date('2026-11-08T14:00:00Z') })
    expect(lib.admit(closed, lib.memberKey('m1'), NOW)).toBe('closed')
  })

  it('can be cleared, for the next time', () => {
    const b = make({ maxViewers: 1 })
    lib.admit(b, lib.memberKey('m1'), NOW)
    expect(lib.clearSeats(b.id)).toBe(1)
    expect(lib.admit(b, lib.memberKey('m2'), NOW)).toBe('ok')
  })
})

describe('what the watching page is told', () => {
  it('lets a signed-in member in with no code, and sends the stream’s address only then', () => {
    const b = make()
    const view = lib.watchState(b, { kind: 'member', userId: 'm1' }, NOW)
    expect(view).toMatchObject({ needs: null, full: false, availability: 'open', title: b.title })
    expect(view.embedUrl).toBe('https://stream.example/watch/abc')
  })

  it('tells a person who is not in what they need, and never sends the address', () => {
    const members = make({ audience: 'members' })
    const guests = make({ audience: 'members_and_guests' })
    expect(lib.watchState(members, { kind: 'none', signedIn: false }, NOW)).toMatchObject({ needs: 'sign-in', embedUrl: null })
    expect(lib.watchState(members, { kind: 'none', signedIn: true }, NOW)).toMatchObject({ needs: 'members', embedUrl: null })
    expect(lib.watchState(guests, { kind: 'none', signedIn: false }, NOW)).toMatchObject({ needs: 'code', embedUrl: null })
    expect(lib.watchState(guests, { kind: 'none', signedIn: true }, NOW)).toMatchObject({ needs: 'code', embedUrl: null })
  })

  it('does not let a guest’s code into a broadcast meant for members only', () => {
    const b = make({ audience: 'members' })
    expect(lib.watchState(b, { kind: 'pass', passId: 'x' }, NOW)).toMatchObject({ needs: 'sign-in', embedUrl: null })
    expect(lib.seatsTaken(b.id)).toBe(0)
  })

  it('lets a guest with a code in only when guests are admitted', () => {
    const b = make({ audience: 'members_and_guests' })
    expect(lib.watchState(b, { kind: 'pass', passId: 'g1' }, NOW)).toMatchObject({ needs: null, embedUrl: 'https://stream.example/watch/abc' })
  })

  it('says it is full, and sends no address, to someone who would need a new seat', () => {
    const b = make({ maxViewers: 1 })
    lib.watchState(b, { kind: 'member', userId: 'first' }, NOW)
    expect(lib.watchState(b, { kind: 'member', userId: 'second' }, NOW)).toMatchObject({ full: true, needs: null, embedUrl: null })
    expect(lib.watchState(b, { kind: 'member', userId: 'first' }, NOW).embedUrl).not.toBeNull()
  })

  it('sends no address before it opens or after it closes, but still says which it is', () => {
    const notYet = make({ isOpen: false })
    expect(lib.watchState(notYet, { kind: 'member', userId: 'm1' }, NOW)).toMatchObject({ availability: 'not-open', embedUrl: null, full: false })
    const over = make({ closesAt: new Date('2026-11-08T14:00:00Z') })
    expect(lib.watchState(over, { kind: 'member', userId: 'm1' }, NOW)).toMatchObject({ availability: 'closed', embedUrl: null })
    expect(lib.seatsTaken(notYet.id) + lib.seatsTaken(over.id)).toBe(0)
  })

  it('tells the stream an id for each viewer that is the same each time and means nothing outside this site', () => {
    const b = make({ streamUrl: 'https://s.example/w?v={viewer}' })
    const a1 = lib.watchState(b, { kind: 'member', userId: 'alice' }, NOW).embedUrl!
    const a2 = lib.watchState(b, { kind: 'member', userId: 'alice' }, NOW).embedUrl!
    const bob = lib.watchState(b, { kind: 'member', userId: 'bob' }, NOW).embedUrl!
    expect(a1).toBe(a2)
    expect(a1).not.toBe(bob)
    expect(a1).toMatch(/\?v=[0-9a-f]{16}$/)
    expect(a1).not.toContain('alice')
  })
})

describe('a guest’s code', () => {
  const guestBroadcast = () => make({ audience: 'members_and_guests' })

  it('is shown once, when made, and only a hash of it is kept', () => {
    const b = guestBroadcast()
    const { pass, code } = lib.createPass(b.id, 'Aunt May', account())
    expect(looksLikeCode(code)).toBe(true)
    const row = db.select().from(schema.broadcastPasses).where(orm.eq(schema.broadcastPasses.id, pass.id)).get()!
    expect(JSON.stringify(row)).not.toContain(normalizeCode(code))
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('lets one browser in, and turns every other browser away: one code is one person', () => {
    const b = guestBroadcast()
    const { code } = lib.createPass(b.id, 'Aunt May', account())
    const mine = lib.newDeviceSecret()
    const result = lib.redeemCode(b, code, mine, NOW)
    expect(result).toMatchObject({ ok: true })
    expect(lib.redeemCode(b, code, mine, NOW)).toMatchObject({ ok: true }) // the same browser again
    expect(lib.redeemCode(b, code, lib.newDeviceSecret(), NOW)).toEqual({ ok: false, reason: 'in-use' })
  })

  it('accepts the code however it is typed', () => {
    const b = guestBroadcast()
    const { code } = lib.createPass(b.id, 'Uncle Bob', account())
    const device = lib.newDeviceSecret()
    expect(lib.redeemCode(b, code.toLowerCase().replace('-', ' '), device, NOW)).toMatchObject({ ok: true })
  })

  it('turns away a wrong code, and a code from another broadcast', () => {
    const b = guestBroadcast()
    const other = guestBroadcast()
    const { code } = lib.createPass(other.id, 'Someone', account())
    expect(lib.redeemCode(b, code, lib.newDeviceSecret(), NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(lib.redeemCode(b, 'AAAAA-AAAAA', lib.newDeviceSecret(), NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(lib.redeemCode(b, 'nonsense', lib.newDeviceSecret(), NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('is recognised again from the cookie the browser was given, and from nothing else', () => {
    const b = guestBroadcast()
    const { code } = lib.createPass(b.id, 'Aunt May', account())
    const secret = lib.newDeviceSecret()
    const result = lib.redeemCode(b, code, secret, NOW)
    if (!result.ok) throw new Error('should have been let in')
    expect(lib.passFromCookie(b, `${result.passId}.${secret}`)).toBe(result.passId)
    expect(lib.passFromCookie(b, `${result.passId}.${lib.newDeviceSecret()}`)).toBeNull()
    expect(lib.passFromCookie(b, `${result.passId}.`)).toBeNull()
    expect(lib.passFromCookie(b, undefined)).toBeNull()
    expect(lib.passFromCookie(guestBroadcast(), `${result.passId}.${secret}`)).toBeNull()
  })

  it('stops working when turned off, and gives its seat back', () => {
    const b = make({ audience: 'members_and_guests', maxViewers: 1 })
    const { pass, code } = lib.createPass(b.id, 'Aunt May', account())
    const secret = lib.newDeviceSecret()
    lib.redeemCode(b, code, secret, NOW)
    lib.watchState(b, { kind: 'pass', passId: pass.id }, NOW)
    expect(lib.seatsTaken(b.id)).toBe(1)
    lib.revokePass(pass.id, NOW)
    expect(lib.seatsTaken(b.id)).toBe(0)
    expect(lib.passFromCookie(b, `${pass.id}.${secret}`)).toBeNull()
    expect(lib.redeemCode(b, code, secret, NOW)).toEqual({ ok: false, reason: 'revoked' })
    expect(lib.watchState(b, { kind: 'member', userId: 'someone-else' }, NOW).embedUrl).not.toBeNull()
  })

  it('can be replaced by a new one for the same person: the old code and the old browser stop working', () => {
    const b = guestBroadcast()
    const { pass, code } = lib.createPass(b.id, 'Aunt May', account())
    const secret = lib.newDeviceSecret()
    lib.redeemCode(b, code, secret, NOW)
    const { code: fresh } = lib.resetPass(pass.id)
    expect(fresh).not.toBe(code)
    expect(lib.passFromCookie(b, `${pass.id}.${secret}`)).toBeNull()
    expect(lib.redeemCode(b, code, lib.newDeviceSecret(), NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(lib.redeemCode(b, fresh, lib.newDeviceSecret(), NOW)).toMatchObject({ ok: true })
  })

  it('cannot be replaced once turned off, or if it does not exist', () => {
    const b = guestBroadcast()
    const { pass } = lib.createPass(b.id, 'Aunt May', account())
    lib.revokePass(pass.id)
    expect(statusOf(() => lib.resetPass(pass.id))).toBe(409)
    expect(statusOf(() => lib.resetPass('missing'))).toBe(404)
    expect(statusOf(() => lib.revokePass('missing'))).toBe(404)
  })
})

describe('guessing codes', () => {
  it('is stopped after a few wrong tries from one place, for a while', () => {
    const key = 'ip-1:bc'
    const t0 = Date.parse('2026-11-08T15:00:00Z')
    for (let i = 0; i < lib.MAX_WRONG_CODES - 1; i++) lib.noteWrongCode(key, t0 + i)
    expect(lib.tooManyWrongCodes(key, t0 + 100)).toBe(false)
    lib.noteWrongCode(key, t0 + 200)
    expect(lib.tooManyWrongCodes(key, t0 + 300)).toBe(true)
    expect(lib.tooManyWrongCodes('someone-else', t0 + 300)).toBe(false)
    expect(lib.tooManyWrongCodes(key, t0 + 11 * 60 * 1000)).toBe(false)
  })

  it('goes by the address Cloudflare saw, never by one the visitor writes', () => {
    expect(lib.guestPlace('bc', '203.0.113.7', '127.0.0.1')).toBe('203.0.113.7:bc')
    expect(lib.guestPlace('bc', undefined, '127.0.0.1')).toBe('127.0.0.1:bc')
    expect(lib.guestPlace('bc', ' ', undefined)).toBe('unknown:bc')
  })

  it('lets go of places whose wait is over, so the list does not grow for ever', () => {
    const t0 = Date.parse('2026-11-08T16:00:00Z')
    lib.noteWrongCode('old-place:bc', t0)
    lib.noteWrongCode('old-place-2:bc', t0)
    expect(lib.placesBeingWatched()).toBeGreaterThanOrEqual(2)
    // Eleven minutes on, the next wrong code clears every place whose ten minutes are over.
    lib.noteWrongCode('new-place:bc', t0 + 11 * 60 * 1000)
    expect(lib.placesBeingWatched()).toBe(1)
  })

  it('is forgotten after a right code', () => {
    const key = 'ip-2:bc'
    for (let i = 0; i < lib.MAX_WRONG_CODES; i++) lib.noteWrongCode(key, 1000)
    expect(lib.tooManyWrongCodes(key, 1001)).toBe(true)
    lib.forgetWrongCodes(key)
    expect(lib.tooManyWrongCodes(key, 1002)).toBe(false)
  })
})

describe('running broadcasts', () => {
  it('names a broadcast from its title, and never reuses a name', () => {
    const owner = account()
    const input = { title: 'Christmas Eve Service!', streamUrl: 'https://s.example/w', audience: 'members' as const, isOpen: false }
    const a = lib.createBroadcast(input, owner)
    const b = lib.createBroadcast(input, owner)
    expect(a.slug).toBe('christmas-eve-service')
    expect(b.slug).toBe('christmas-eve-service-2')
  })

  it('changes only what is given, and reads dates in', () => {
    const owner = account()
    const a = lib.createBroadcast({ title: 'T', streamUrl: 'https://s.example/w', audience: 'members', isOpen: false, maxViewers: 5 }, owner)
    const updated = lib.updateBroadcast(a.id, { isOpen: true, closesAt: '2026-11-08T20:00:00.000Z' })
    expect(updated).toMatchObject({ title: 'T', isOpen: true, maxViewers: 5 })
    expect(updated.closesAt?.toISOString()).toBe('2026-11-08T20:00:00.000Z')
    expect(lib.updateBroadcast(a.id, { maxViewers: null, closesAt: null })).toMatchObject({ maxViewers: null, closesAt: null })
    expect(statusOf(() => lib.updateBroadcast('missing', { isOpen: true }))).toBe(404)
  })

  it('shows its seats and its codes to the office, never a code itself', () => {
    const owner = account()
    const b = lib.createBroadcast({ title: 'Shown', streamUrl: 'https://s.example/w', audience: 'members_and_guests', isOpen: true, maxViewers: 10 }, owner)
    const { pass, code } = lib.createPass(b.id, 'Aunt May', owner)
    lib.createPass(b.id, 'Uncle Bob', owner)
    lib.redeemCode(b, code, lib.newDeviceSecret(), NOW)
    lib.revokePass(lib.createPass(b.id, 'Cousin', owner).pass.id)
    lib.admit(b, lib.memberKey('m1'), new Date())
    const view = lib.presentBroadcast(b, new Date())
    expect(view).toMatchObject({ seatsTaken: 1, maxViewers: 10, audience: 'members_and_guests' })
    expect(view.passes.map(p => [p.label, p.state])).toEqual([['Aunt May', 'in-use'], ['Uncle Bob', 'unused'], ['Cousin', 'revoked']])
    expect(JSON.stringify(view)).not.toContain(normalizeCode(code))
    expect(view.passes.find(p => p.id === pass.id)!.usedAt).not.toBeNull()
  })

  it('goes with its seats and codes when deleted', () => {
    const b = make({ audience: 'members_and_guests' })
    lib.createPass(b.id, 'x', null)
    lib.admit(b, lib.memberKey('m1'), NOW)
    db.delete(schema.broadcasts).where(orm.eq(schema.broadcasts.id, b.id)).run()
    expect(db.select().from(schema.broadcastPasses).where(orm.eq(schema.broadcastPasses.broadcastId, b.id)).all()).toEqual([])
    expect(lib.seatsTaken(b.id)).toBe(0)
  })
})
