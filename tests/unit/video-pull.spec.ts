// Bringing the original of a message's video in from the church video host, into the church
// server's folder. The host's API and delivery address are stand-ins that record what they are asked.
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-video-pull-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.BETTER_AUTH_SECRET = 'test-secret-for-the-pull-tests-0123456789'
process.env.BETTER_AUTH_URL = 'https://church.example'
const folder = join(dir, 'videos')
const CONFIG = { libraryId: '123', apiKey: 'api-key', tokenKey: 'token-key' }
const CDN = 'vz-abc123-xyz.b-cdn.net'

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let push: typeof import('../../server/lib/video-push')
let files: typeof import('../../server/lib/local-files')
let lib: typeof import('../../server/lib/sermons')
let bunny: typeof import('../../server/lib/bunny')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  push = await import('../../server/lib/video-push')
  files = await import('../../server/lib/local-files')
  lib = await import('../../server/lib/sermons')
  bunny = await import('../../server/lib/bunny')
  orm = await import('drizzle-orm')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let n = 0
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const message = (hostedVideoId: string | null = `host-${++n}`) =>
  db.insert(schema.sermons).values({ slug: `2026-11-02-pull-${++n}`, title: `Message ${n}`, preachedOn: '2026-11-02', speaker: 'Speaker', status: 'published', visibility: 'members', ...(hostedVideoId ? { hostedVideoId, hostedVideoState: 'ready' as const } : {}) }).returning().get()

// A stand-in host: answers the API's video lookup and the delivery address's file.
const host = (options: { data?: Buffer, hasOriginal?: boolean, originalHash?: string | null, downloadStatus?: number, contentType?: string, contentLength?: number | string } = {}) => {
  const data = options.data ?? randomBytes(300_000)
  const calls: Array<{ url: string, headers: Headers }> = []
  const doFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, headers: new Headers(init?.headers) })
    if (u.includes('/library/123/videos/')) {
      return new Response(JSON.stringify({ status: 4, hasOriginal: options.hasOriginal ?? true, originalHash: options.originalHash === undefined ? sha(data).toUpperCase() : options.originalHash }), { status: 200 })
    }
    if (u.startsWith(`https://${CDN}/`)) {
      if (options.downloadStatus && options.downloadStatus !== 200) return new Response('no', { status: options.downloadStatus })
      return new Response(data, { status: 200, headers: { 'content-type': options.contentType ?? 'video/mp4', 'content-length': String(options.contentLength ?? data.length) } })
    }
    return new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
  return { data, calls, doFetch }
}
const pull = (id: string, h: ReturnType<typeof host>, over: Record<string, unknown> = {}) =>
  push.pullFromHost(id, { config: CONFIG, cdnHost: CDN, folder, doFetch: h.doFetch, origin: 'https://church.example', ...over })
const holding = () => (existsSync(join(folder, files.INCOMING)) ? readdirSync(join(folder, files.INCOMING)) : [])

describe('the video host’s delivery hostname', () => {
  it('tidies a pasted address down to the hostname', () => {
    expect(bunny.normalizeCdnHost('vz-abc123-xyz.b-cdn.net')).toBe(CDN)
    expect(bunny.normalizeCdnHost('  https://VZ-ABC123-XYZ.b-cdn.net/  ')).toBe(CDN)
    expect(bunny.normalizeCdnHost('http://vz-abc123-xyz.b-cdn.net/some/path')).toBe(CDN)
  })

  it('refuses something that is not a hostname, with a plain reason', () => {
    for (const bad of ['', 'not a host', 'a/b', '-bad.example.com', 'https://', 'exa mple.com']) {
      expect(() => bunny.normalizeCdnHost(bad)).toThrow(/delivery hostname/)
    }
  })
})

describe('the signed address of the original', () => {
  it('is signed the way the host checks it: HMAC-SHA256 of the path and the expiry, URL-safe', () => {
    expect(bunny.originalFileUrl(CONFIG, 'cdn.example', 'vid-1', 1700000000))
      .toBe('https://cdn.example/vid-1/original?token=HS256-O6CruKTti81KpCybUGSxX7HP6nslS2hE0qsuJ4EmEi0&expires=1700000000')
  })

  it('changes with the video and the time, so it cannot be reused or lengthened', () => {
    const url = bunny.originalFileUrl(CONFIG, 'cdn.example', 'vid-1', 1700000000)
    expect(bunny.originalFileUrl(CONFIG, 'cdn.example', 'vid-2', 1700000000)).not.toBe(url)
    expect(bunny.originalFileUrl(CONFIG, 'cdn.example', 'vid-1', 1700000001)).not.toBe(url)
    expect(url).not.toContain('token-key')
    expect(new URL(url).searchParams.get('token')).toMatch(/^HS256-[A-Za-z0-9_-]+$/)
  })
})

describe('bringing a copy in', () => {
  it('downloads the original, checks it against the host’s checksum, and files it like an upload', async () => {
    const row = message()
    const h = host()
    expect(await pull(row.id, h)).toBe('sent')

    const stored = files.loadLocalFile(row.id)!
    expect(stored).toMatchObject({ size: h.data.length, sha256: sha(h.data), storedBy: null })
    expect(stored.relativePath).toMatch(/^2026\/.+\/original\.mp4$/)
    expect(readFileSync(join(folder, stored.relativePath)).equals(h.data)).toBe(true)
    expect(push.loadPush(row.id, 'pull')).toMatchObject({ state: 'sent', attempts: 1 })
    expect(holding().filter(name => name.startsWith('pull-'))).toEqual([])
  })

  it('asks the host about the video first, then fetches the signed original with the site as referrer', async () => {
    const row = message('host-lookup')
    const h = host()
    await pull(row.id, h)
    expect(h.calls[0]!.url).toContain('/library/123/videos/host-lookup')
    expect(h.calls[0]!.headers.get('accesskey')).toBe('api-key')
    expect(h.calls[1]!.url).toMatch(new RegExp(`^https://${CDN}/host-lookup/original\\?token=HS256-[\\w-]+&expires=\\d+$`))
    expect(h.calls[1]!.headers.get('referer')).toBe('https://church.example/')
  })

  it('keeps the file type the host reports', async () => {
    const row = message()
    await pull(row.id, host({ contentType: 'video/quicktime' }))
    expect(files.loadLocalFile(row.id)!.relativePath).toMatch(/original\.mov$/)
  })

  it('refuses a file whose checksum is not the one the host holds, and keeps nothing', async () => {
    const row = message()
    const h = host({ originalHash: sha(Buffer.from('some other file')) })
    expect(await pull(row.id, h)).toBe('failed')
    expect(push.loadPush(row.id, 'pull')!.lastError).toMatch(/checksums differ/)
    expect(files.loadLocalFile(row.id)).toBeUndefined()
    expect(holding().filter(name => name.startsWith('pull-'))).toEqual([])
  })

  it('accepts a file when the host gives no checksum, relying on the size', async () => {
    const row = message()
    expect(await pull(row.id, host({ originalHash: null }))).toBe('sent')
  })

  it('says so, without downloading, when the host no longer holds the original', async () => {
    const row = message()
    const h = host({ hasOriginal: false })
    expect(await pull(row.id, h)).toBe('failed')
    expect(push.loadPush(row.id, 'pull')!.lastError).toMatch(/Keep original files/)
    expect(h.calls.some(c => c.url.startsWith(`https://${CDN}/`))).toBe(false)
  })

  it('fails with the reason when the host will not give the file', async () => {
    const row = message()
    expect(await pull(row.id, host({ downloadStatus: 403 }))).toBe('failed')
    expect(push.loadPush(row.id, 'pull')!.lastError).toMatch(/\(403\)/)
    expect(files.loadLocalFile(row.id)).toBeUndefined()
  })

  it('refuses a download that stops short, and one the disk has no room for', async () => {
    const short = message()
    expect(await pull(short.id, host({ contentLength: 400_000 }))).toBe('failed')
    expect(push.loadPush(short.id, 'pull')!.lastError).toMatch(/stopped before/)
    expect(files.loadLocalFile(short.id)).toBeUndefined()
    expect(holding().filter(name => name.startsWith('pull-'))).toEqual([])

    const huge = message()
    expect(await pull(huge.id, host({ contentLength: 10 ** 15 }))).toBe('failed')
    expect(push.loadPush(huge.id, 'pull')!.lastError).toMatch(/room/)
  })

  it('does nothing for a message with no copy on the host, and leaves an existing local copy alone', async () => {
    const h = host()
    expect(await pull(message(null).id, h)).toBe('skipped')
    expect(h.calls).toHaveLength(0)

    const row = message()
    await pull(row.id, host())
    const before = files.loadLocalFile(row.id)!
    const again = host()
    expect(await pull(row.id, again)).toBe('skipped')
    expect(again.calls).toHaveLength(0)
    expect(files.loadLocalFile(row.id)!.sha256).toBe(before.sha256)
  })

  it('does not send the stored copy back to the host it came from', async () => {
    const row = message()
    await pull(row.id, host())
    expect(push.loadPush(row.id, 'host')).toBeUndefined()
    expect(push.loadPush(row.id, 'youtube')).toBeUndefined()
  })

  it('shows its progress with the message', async () => {
    const row = message()
    expect(lib.presentAdminSermon(lib.loadSermon({ id: row.id })!).hostPull).toBeNull()
    push.queuePull(row.id)
    expect(lib.presentAdminSermon(lib.loadSermon({ id: row.id })!).hostPull).toMatchObject({ state: 'queued', attempts: 0 })
    await pull(row.id, host({ hasOriginal: false }))
    expect(lib.presentAdminSermon(lib.loadSermon({ id: row.id })!).hostPull).toMatchObject({ state: 'failed', attempts: 1, willRetry: true })
  })
})

describe('the background worker and bringing copies in', () => {
  it('brings a copy in when the hostname is known, and leaves it waiting when it is not', async () => {
    db.delete(schema.videoPushes).run()
    const ready = message()
    const waiting = message()
    push.queuePull(ready.id)
    push.queuePull(waiting.id)
    db.update(schema.videoPushes).set({ nextAttemptAt: new Date(0) }).where(orm.eq(schema.videoPushes.sermonId, waiting.id)).run()

    const without = await push.runPushes({ config: CONFIG, youtube: null, cdnHost: null, folder, doFetch: host().doFetch })
    expect(without).toMatchObject({ sent: 0, failed: 0 })
    expect(push.loadPush(ready.id, 'pull')!.state).toBe('queued')

    const withHost = await push.runPushes({ config: CONFIG, youtube: null, cdnHost: CDN, folder, doFetch: host().doFetch })
    expect(withHost.sent).toBe(2)
    expect(push.loadPush(ready.id, 'pull')!.state).toBe('sent')
  })
})
