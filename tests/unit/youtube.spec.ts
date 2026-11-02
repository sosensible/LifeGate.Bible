// The church's YouTube channel: the sign-in, the kept key, and the calls to Google.
// Google is faked: nothing here reaches the network.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-youtube-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.BETTER_AUTH_SECRET = 'test-secret-for-the-youtube-tests-0123456789'

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let yt: typeof import('../../server/lib/youtube')

const CONFIG = { clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://church.example/api/admin/youtube/callback' }

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  yt = await import('../../server/lib/youtube')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))
afterEach(() => {
  delete process.env.YOUTUBE_CLIENT_ID
  delete process.env.YOUTUBE_CLIENT_SECRET
  delete process.env.BETTER_AUTH_URL
  delete process.env.NUXT_PUBLIC_SITE_URL
  yt.deleteConnection()
})

const account = () => {
  const n = Math.random().toString(36).slice(2)
  const now = new Date()
  return db.insert(schema.user).values({ id: `yt-${n}`, name: 'Owner', email: `${n}@example.org`, emailVerified: true, createdAt: now, updatedAt: now }).returning().get().id
}

// A fake Google: records every request, answers from a script.
const google = (answers: Array<{ status?: number, body?: unknown, headers?: Record<string, string> }>) => {
  const calls: Array<{ url: string, method: string, headers: Headers, body: string | null }> = []
  const doFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: (init?.body as string | undefined) ?? null })
    const answer = answers.shift() ?? { body: {} }
    return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200, headers: answer.headers })
  }) as unknown as typeof fetch
  return { doFetch, calls }
}

describe('the connection settings', () => {
  it('are off until the client id, the secret and the site address are all there', () => {
    expect(yt.youtubeConfig()).toBeNull()
    process.env.YOUTUBE_CLIENT_ID = 'client-id'
    process.env.YOUTUBE_CLIENT_SECRET = 'client-secret'
    expect(yt.youtubeConfig()).toBeNull()
    process.env.BETTER_AUTH_URL = 'https://church.example/'
    expect(yt.youtubeConfig()).toEqual(CONFIG)
  })
})

describe('keeping the refresh token', () => {
  it('encrypts it so it is not readable in the database, and decrypts it with the same secret', () => {
    const stored = yt.encryptToken('1//the-refresh-token')
    expect(stored).not.toContain('refresh-token')
    expect(yt.decryptToken(stored)).toBe('1//the-refresh-token')
  })

  it('encrypts the same token differently each time', () => {
    expect(yt.encryptToken('same')).not.toBe(yt.encryptToken('same'))
  })

  it('cannot be read with another secret, or if it has been altered', () => {
    const stored = yt.encryptToken('token', 'one-secret')
    expect(() => yt.decryptToken(stored, 'another-secret')).toThrow()
    const [iv, tag, body] = stored.split('.')
    expect(() => yt.decryptToken(`${iv}.${tag}.${body!.slice(0, -2)}AA`, 'one-secret')).toThrow()
    expect(() => yt.decryptToken('nonsense', 'one-secret')).toThrow(/damaged/)
  })
})

describe('the sign-in state', () => {
  it('names the person it was made for, for ten minutes', () => {
    const now = 1_700_000_000_000
    const state = yt.signState('user-1', now)
    expect(yt.verifyState(state, now + 5 * 60_000)).toBe('user-1')
    expect(yt.verifyState(state, now + 11 * 60_000)).toBeNull()
  })

  it('is refused if it is altered, or was made with another secret', () => {
    const now = 1_700_000_000_000
    const state = yt.signState('user-1', now)
    const [payload, sig] = state.split('.')
    const forged = Buffer.from(`user-2.${Math.floor(now / 1000) + 600}`).toString('base64url')
    expect(yt.verifyState(`${forged}.${sig}`, now)).toBeNull()
    expect(yt.verifyState(`${payload}.${sig!.slice(0, -1)}x`, now)).toBeNull()
    expect(yt.verifyState(yt.signState('user-1', now, 'other-secret'), now)).toBeNull()
    expect(yt.verifyState('', now)).toBeNull()
    expect(yt.verifyState('nonsense', now)).toBeNull()
  })

  it('keeps a person’s id with dots in it intact', () => {
    const now = 1_700_000_000_000
    expect(yt.verifyState(yt.signState('a.b.c', now), now)).toBe('a.b.c')
  })
})

describe('the Google sign-in address', () => {
  it('asks only to upload and read the channel, for lasting access, and carries the state', () => {
    const url = new URL(yt.authUrl(CONFIG, 'the-state'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const params = url.searchParams
    expect(params.get('client_id')).toBe('client-id')
    expect(params.get('redirect_uri')).toBe(CONFIG.redirectUri)
    expect(params.get('response_type')).toBe('code')
    expect(params.get('access_type')).toBe('offline')
    expect(params.get('prompt')).toBe('consent')
    expect(params.get('state')).toBe('the-state')
    expect(params.get('scope')!.split(' ').sort()).toEqual([
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.upload',
    ])
    expect(url.toString()).not.toContain('client-secret')
  })
})

describe('talking to Google', () => {
  it('exchanges the code for the lasting key', async () => {
    const g = google([{ body: { access_token: 'access', refresh_token: 'refresh' } }])
    expect(await yt.exchangeCode(CONFIG, 'the-code', g.doFetch)).toEqual({ accessToken: 'access', refreshToken: 'refresh' })
    expect(g.calls[0]!.url).toBe('https://oauth2.googleapis.com/token')
    const sent = new URLSearchParams(g.calls[0]!.body!)
    expect(Object.fromEntries(sent)).toMatchObject({ code: 'the-code', grant_type: 'authorization_code', client_id: 'client-id', client_secret: 'client-secret', redirect_uri: CONFIG.redirectUri })
  })

  it('says what to do when Google gives no lasting key, and passes on Google’s own reason', async () => {
    await expect(yt.exchangeCode(CONFIG, 'c', google([{ body: { access_token: 'access' } }]).doFetch)).rejects.toThrow(/connected apps/)
    await expect(yt.exchangeCode(CONFIG, 'c', google([{ status: 400, body: { error: 'invalid_grant', error_description: 'Bad code' } }]).doFetch)).rejects.toThrow('Bad code')
  })

  it('gets a fresh access token from the lasting key', async () => {
    const g = google([{ body: { access_token: 'fresh' } }])
    expect(await yt.refreshAccessToken(CONFIG, 'the-refresh', g.doFetch)).toBe('fresh')
    expect(Object.fromEntries(new URLSearchParams(g.calls[0]!.body!))).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'the-refresh' })
  })

  it('reads the channel’s name, and says so when the account has no channel', async () => {
    const g = google([{ body: { items: [{ id: 'UC123', snippet: { title: 'Lifegate' } }] } }])
    expect(await yt.fetchChannel('access', g.doFetch)).toEqual({ id: 'UC123', title: 'Lifegate' })
    expect(g.calls[0]!.headers.get('authorization')).toBe('Bearer access')
    await expect(yt.fetchChannel('access', google([{ body: { items: [] } }]).doFetch)).rejects.toThrow(/no YouTube channel/)
  })

  it('confirms a video is on the church’s channel, and not anyone else’s', async () => {
    expect(await yt.videoIsOnChannel('a', 'vid', 'UC123', google([{ body: { items: [{ snippet: { channelId: 'UC123' } }] } }]).doFetch)).toBe(true)
    expect(await yt.videoIsOnChannel('a', 'vid', 'UC123', google([{ body: { items: [{ snippet: { channelId: 'UCother' } }] } }]).doFetch)).toBe(false)
    expect(await yt.videoIsOnChannel('a', 'vid', 'UC123', google([{ body: { items: [] } }]).doFetch)).toBe(false)
  })

  it('starts an unlisted upload from this site’s address, and returns where to send the file', async () => {
    const g = google([{ headers: { location: 'https://upload.example/session-1' } }])
    const url = await yt.startUploadSession('access', { title: 'The Good Shepherd', description: 'Notes', privacy: 'unlisted' }, { size: 1234, type: 'video/mp4' }, 'https://church.example', g.doFetch)
    expect(url).toBe('https://upload.example/session-1')
    const call = g.calls[0]!
    expect(call.url).toContain('uploadType=resumable')
    expect(call.headers.get('origin')).toBe('https://church.example')
    expect(call.headers.get('x-upload-content-length')).toBe('1234')
    expect(call.headers.get('x-upload-content-type')).toBe('video/mp4')
    expect(JSON.parse(call.body!)).toEqual({ snippet: { title: 'The Good Shepherd', description: 'Notes' }, status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false } })
  })

  it('trims a title and notes to what YouTube allows, and refuses a start with no address', async () => {
    const g = google([{ headers: { location: 'https://upload.example/s' } }])
    await yt.startUploadSession('a', { title: 'x'.repeat(300), description: 'y'.repeat(9000), privacy: 'unlisted' }, { size: 1, type: '' }, 'https://church.example', g.doFetch)
    const sent = JSON.parse(g.calls[0]!.body!)
    expect(sent.snippet.title).toHaveLength(100)
    expect(sent.snippet.description).toHaveLength(5000)
    expect(g.calls[0]!.headers.get('x-upload-content-type')).toBe('video/*')
    await expect(yt.startUploadSession('a', { title: 't', description: null, privacy: 'unlisted' }, { size: 1, type: 'video/mp4' }, 'https://c.example', google([{ status: 200 }]).doFetch)).rejects.toThrow(/would not start/)
  })

  it('tells Google to forget the access when disconnecting, and carries on if that fails', async () => {
    const g = google([{ status: 200 }])
    await yt.revokeToken('the-token', g.doFetch)
    expect(g.calls[0]!.url).toBe('https://oauth2.googleapis.com/revoke')
    await expect(yt.revokeToken('t', google([{ status: 400 }]).doFetch)).resolves.toBeUndefined()
  })
})

describe('the saved connection', () => {
  it('is kept once, replaced on a reconnect, and removed on disconnect', () => {
    const owner = account()
    expect(yt.youtubeStatus()).toEqual({ configured: false, connected: false, channelTitle: null, redirectUri: null })
    process.env.BETTER_AUTH_URL = 'https://church.example/'
    expect(yt.youtubeStatus().redirectUri).toBe('https://church.example/api/admin/youtube/callback')
    delete process.env.BETTER_AUTH_URL
    yt.saveConnection({ id: 'UC1', title: 'First' }, 'refresh-one', owner)
    yt.saveConnection({ id: 'UC2', title: 'Second' }, 'refresh-two', owner)
    expect(db.select().from(schema.youtubeConnection).all()).toHaveLength(1)
    expect(yt.youtubeStatus()).toMatchObject({ connected: true, channelTitle: 'Second' })
    yt.deleteConnection()
    expect(yt.youtubeStatus().connected).toBe(false)
  })

  it('never stores the refresh token readably', () => {
    yt.saveConnection({ id: 'UC1', title: 'Church' }, 'plain-refresh-token', account())
    const row = yt.loadConnection()!
    expect(row.refreshTokenEncrypted).not.toContain('plain-refresh-token')
    expect(yt.decryptToken(row.refreshTokenEncrypted)).toBe('plain-refresh-token')
  })

  it('has no access to give when nothing is connected, and a fresh one when it is', async () => {
    expect(await yt.connectedAccess(CONFIG, google([]).doFetch)).toBeNull()
    yt.saveConnection({ id: 'UC9', title: 'Church' }, 'saved-refresh', account())
    const g = google([{ body: { access_token: 'fresh-access' } }])
    expect(await yt.connectedAccess(CONFIG, g.doFetch)).toEqual({ accessToken: 'fresh-access', channelId: 'UC9', channelTitle: 'Church' })
    expect(new URLSearchParams(g.calls[0]!.body!).get('refresh_token')).toBe('saved-refresh')
  })
})
