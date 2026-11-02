// Shared broadcasts: who may open the watching page, and how many people in total.
//
// The stream itself is not here: it comes from elsewhere (the church's soStream) and is shown in a
// frame on a locked page of this site. This decides who is let in:
//   - a signed-in member, with no code;
//   - if the broadcast also admits guests, a person holding a code made for them alone;
// and, if the broadcast has a limit, stops letting new people in once all the seats are taken.
// The stream's address is sent to a browser only after the person has been let in.
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { and, asc, count, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import {
  broadcastAvailability, CODE_ALPHABET, CODE_LENGTH, embedUrlFor, formatCode, looksLikeCode, normalizeCode,
  type BroadcastAdminView, type BroadcastInput, type PassState, type PassView, type WatchView,
} from '../../shared/broadcast.ts'
import { broadcastPasses, broadcastSeats, broadcasts } from '../database/schema/index.ts'
import { db } from './db.ts'

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export type Broadcast = typeof broadcasts.$inferSelect

export const loadBroadcast = (id: string) => db.select().from(broadcasts).where(eq(broadcasts.id, id)).get()
export const loadBroadcastBySlug = (slug: string) => db.select().from(broadcasts).where(eq(broadcasts.slug, slug)).get()

export const seatsTaken = (broadcastId: string) =>
  db.select({ n: count() }).from(broadcastSeats).where(eq(broadcastSeats.broadcastId, broadcastId)).get()?.n ?? 0

// ---- Seats -----------------------------------------------------------------------------

export const memberKey = (userId: string) => `u:${userId}`
export const passKey = (passId: string) => `p:${passId}`
// An id for the person watching that means nothing outside this site: what the stream's own side is told.
export const viewerIdFor = (viewerKey: string) => sha256(`viewer:${viewerKey}`).slice(0, 16)

// Lets a person in: they keep their seat if they have one, and otherwise take one if any are left.
export const admit = (broadcast: Broadcast, viewerKey: string, now: Date): 'ok' | 'full' | 'not-open' | 'closed' => {
  const availability = broadcastAvailability(broadcast, now)
  if (availability !== 'open') return availability
  return db.transaction((tx) => {
    if (tx.select().from(broadcastSeats).where(and(eq(broadcastSeats.broadcastId, broadcast.id), eq(broadcastSeats.viewerKey, viewerKey))).get()) return 'ok' as const
    if (broadcast.maxViewers !== null) {
      const taken = tx.select({ n: count() }).from(broadcastSeats).where(eq(broadcastSeats.broadcastId, broadcast.id)).get()?.n ?? 0
      if (taken >= broadcast.maxViewers) return 'full' as const
    }
    tx.insert(broadcastSeats).values({ broadcastId: broadcast.id, viewerKey, takenAt: now }).run()
    return 'ok' as const
  })
}

export const clearSeats = (broadcastId: string) => db.delete(broadcastSeats).where(eq(broadcastSeats.broadcastId, broadcastId)).run().changes

// ---- Guest codes -----------------------------------------------------------------------

export const generateCode = () => Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
const hashCode = (code: string) => sha256(`pass:${normalizeCode(code)}`)

export const createPass = (broadcastId: string, label: string, userId: string | null, now = new Date()) => {
  const code = generateCode()
  const pass = db.insert(broadcastPasses).values({ broadcastId, label, codeHash: hashCode(code), createdBy: userId, createdAt: now }).returning().get()
  return { pass, code: formatCode(code) }
}

// A new code for the same person: the old one stops working, and so does the browser it was tied to.
export const resetPass = (passId: string) => {
  const existing = db.select().from(broadcastPasses).where(eq(broadcastPasses.id, passId)).get()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Code not found' })
  if (existing.revokedAt) throw createError({ statusCode: 409, statusMessage: 'That code was turned off. Make a new one instead.' })
  const code = generateCode()
  db.update(broadcastPasses).set({ codeHash: hashCode(code), deviceHash: null, usedAt: null }).where(eq(broadcastPasses.id, passId)).run()
  return { code: formatCode(code) }
}

// Turns a code off for good, and gives its seat back.
export const revokePass = (passId: string, now = new Date()) => {
  const existing = db.select().from(broadcastPasses).where(eq(broadcastPasses.id, passId)).get()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Code not found' })
  db.transaction((tx) => {
    tx.update(broadcastPasses).set({ revokedAt: existing.revokedAt ?? now }).where(eq(broadcastPasses.id, passId)).run()
    tx.delete(broadcastSeats).where(and(eq(broadcastSeats.broadcastId, existing.broadcastId), eq(broadcastSeats.viewerKey, passKey(passId)))).run()
  })
}

export const newDeviceSecret = () => randomBytes(24).toString('base64url')

export type Redeemed = { ok: true, passId: string } | { ok: false, reason: 'invalid' | 'revoked' | 'in-use' }

// Checks a typed code. The first browser to use a code is remembered; any other is turned away, so one
// code is one person. The browser keeps `deviceSecret` (in a cookie) to prove it is the same one.
export const redeemCode = (broadcast: Broadcast, typed: string, deviceSecret: string, now = new Date()): Redeemed => {
  if (!looksLikeCode(typed)) return { ok: false, reason: 'invalid' }
  return db.transaction((tx) => {
    const pass = tx.select().from(broadcastPasses).where(and(eq(broadcastPasses.broadcastId, broadcast.id), eq(broadcastPasses.codeHash, hashCode(typed)))).get()
    if (!pass) return { ok: false as const, reason: 'invalid' as const }
    if (pass.revokedAt) return { ok: false as const, reason: 'revoked' as const }
    if (pass.deviceHash && pass.deviceHash !== sha256(deviceSecret)) return { ok: false as const, reason: 'in-use' as const }
    if (!pass.deviceHash) tx.update(broadcastPasses).set({ deviceHash: sha256(deviceSecret), usedAt: now }).where(eq(broadcastPasses.id, pass.id)).run()
    return { ok: true as const, passId: pass.id }
  })
}

// Who a browser's cookie says it is: the pass it was given when its code was entered.
export const passFromCookie = (broadcast: Broadcast, cookie: string | undefined) => {
  const [passId, secret] = (cookie ?? '').split('.')
  if (!passId || !secret) return null
  const pass = db.select().from(broadcastPasses).where(and(eq(broadcastPasses.id, passId), eq(broadcastPasses.broadcastId, broadcast.id))).get()
  return pass && !pass.revokedAt && pass.deviceHash === sha256(secret) ? pass.id : null
}

// A few wrong codes in a row from one place are enough: after that, wait.
const attempts = new Map<string, { count: number, since: number }>()
const WINDOW_MS = 10 * 60 * 1000
export const MAX_WRONG_CODES = 8

// "One place" is the address Cloudflare saw (it sets cf-connecting-ip itself, and drops any copy
// a visitor sends), else the connection's own. X-Forwarded-For is not used: a visitor can write it.
export const guestPlace = (broadcastId: string, cloudflareAddress: string | undefined, socketAddress: string | undefined) =>
  `${cloudflareAddress?.trim() || socketAddress || 'unknown'}:${broadcastId}`
export const tooManyWrongCodes = (key: string, now = Date.now()) => {
  const entry = attempts.get(key)
  return Boolean(entry && now - entry.since < WINDOW_MS && entry.count >= MAX_WRONG_CODES)
}
export const noteWrongCode = (key: string, now = Date.now()) => {
  // Drop places whose window has passed, so the list stays as small as the last ten minutes of guessing.
  for (const [place, seen] of attempts) if (now - seen.since >= WINDOW_MS) attempts.delete(place)
  const entry = attempts.get(key)
  if (!entry || now - entry.since >= WINDOW_MS) attempts.set(key, { count: 1, since: now })
  else entry.count += 1
}
export const forgetWrongCodes = (key: string) => attempts.delete(key)
export const placesBeingWatched = () => attempts.size

// ---- What the watching page is told ----------------------------------------------------

export type Who =
  | { kind: 'member', userId: string }
  | { kind: 'pass', passId: string }
  | { kind: 'none', signedIn: boolean }

export const watchState = (broadcast: Broadcast, who: Who, now = new Date()): WatchView => {
  const base = { title: broadcast.title, description: broadcast.description, availability: broadcastAvailability(broadcast, now) }
  if (who.kind === 'none') {
    const needs = who.signedIn ? (broadcast.audience === 'members' ? 'members' : 'code') : (broadcast.audience === 'members' ? 'sign-in' : 'code')
    return { ...base, needs, full: false, embedUrl: null }
  }
  if (who.kind === 'pass' && broadcast.audience === 'members') return { ...base, needs: 'sign-in', full: false, embedUrl: null }
  const key = who.kind === 'member' ? memberKey(who.userId) : passKey(who.passId)
  const result = admit(broadcast, key, now)
  if (result === 'full') return { ...base, needs: null, full: true, embedUrl: null }
  if (result !== 'ok') return { ...base, needs: null, full: false, embedUrl: null }
  return { ...base, needs: null, full: false, embedUrl: embedUrlFor(broadcast.streamUrl, viewerIdFor(key)) }
}

// ---- For the people who run broadcasts -------------------------------------------------

const slugify = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')

export const uniqueBroadcastSlug = (title: string) => {
  const base = slugify(title) || 'broadcast'
  for (let n = 1; ; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`
    if (!loadBroadcastBySlug(slug)) return slug
  }
}

const toDate = (value: string | null | undefined) => (value ? new Date(value) : null)

export const createBroadcast = (input: BroadcastInput, userId: string, now = new Date()) =>
  db.insert(broadcasts).values({
    slug: uniqueBroadcastSlug(input.title),
    title: input.title,
    description: input.description || null,
    streamUrl: input.streamUrl,
    audience: input.audience,
    maxViewers: input.maxViewers ?? null,
    isOpen: input.isOpen,
    opensAt: toDate(input.opensAt),
    closesAt: toDate(input.closesAt),
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  }).returning().get()

export const updateBroadcast = (id: string, input: Partial<BroadcastInput>, now = new Date()) => {
  if (!loadBroadcast(id)) throw createError({ statusCode: 404, statusMessage: 'Broadcast not found' })
  const values: Partial<typeof broadcasts.$inferInsert> = { updatedAt: now }
  if (input.title !== undefined) values.title = input.title
  if (input.description !== undefined) values.description = input.description || null
  if (input.streamUrl !== undefined) values.streamUrl = input.streamUrl
  if (input.audience !== undefined) values.audience = input.audience
  if (input.maxViewers !== undefined) values.maxViewers = input.maxViewers
  if (input.isOpen !== undefined) values.isOpen = input.isOpen
  if (input.opensAt !== undefined) values.opensAt = toDate(input.opensAt)
  if (input.closesAt !== undefined) values.closesAt = toDate(input.closesAt)
  return db.update(broadcasts).set(values).where(eq(broadcasts.id, id)).returning().get()!
}

const passState = (pass: typeof broadcastPasses.$inferSelect): PassState => (pass.revokedAt ? 'revoked' : pass.deviceHash ? 'in-use' : 'unused')

export const presentBroadcast = (broadcast: Broadcast, now = new Date()): BroadcastAdminView => ({
  id: broadcast.id,
  slug: broadcast.slug,
  title: broadcast.title,
  description: broadcast.description,
  streamUrl: broadcast.streamUrl,
  audience: broadcast.audience,
  maxViewers: broadcast.maxViewers,
  isOpen: broadcast.isOpen,
  opensAt: broadcast.opensAt?.toISOString() ?? null,
  closesAt: broadcast.closesAt?.toISOString() ?? null,
  availability: broadcastAvailability(broadcast, now),
  seatsTaken: seatsTaken(broadcast.id),
  passes: db.select().from(broadcastPasses).where(eq(broadcastPasses.broadcastId, broadcast.id)).orderBy(asc(broadcastPasses.createdAt), sql`rowid`).all().map((pass): PassView => ({
    id: pass.id,
    label: pass.label,
    state: passState(pass),
    createdAt: pass.createdAt.toISOString(),
    usedAt: pass.usedAt?.toISOString() ?? null,
  })),
})

export const listBroadcasts = (now = new Date()) =>
  db.select().from(broadcasts).orderBy(asc(broadcasts.createdAt), sql`rowid`).all().map(row => presentBroadcast(row, now)).reverse()
