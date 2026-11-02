// Sending the stored copy of a message's video on to the church video host, from the server.
// The host is a stand-in that checks the real signatures and keeps what it is sent.
import { createServer, type Server as HttpServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { FileStore } from '@tus/file-store'
import { Server as TusServer } from '@tus/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-video-push-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.BETTER_AUTH_SECRET = 'test-secret-for-the-push-tests-0123456789'
const folder = join(dir, 'videos')
const CONFIG = { libraryId: '123', apiKey: 'api-key', tokenKey: 'token-key' }

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let push: typeof import('../../server/lib/video-push')
let lib: typeof import('../../server/lib/sermons')
let hosted: typeof import('../../server/lib/hosted-video')
let orm: typeof import('drizzle-orm')
let host: HttpServer

// What the stand-in host has seen.
const seen = { created: [] as string[], deleted: [] as string[], received: new Map<string, Buffer>(), badSignatures: 0 }
const failing = { create: 0, tus: 0 }

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  push = await import('../../server/lib/video-push')
  lib = await import('../../server/lib/sermons')
  hosted = await import('../../server/lib/hosted-video')
  orm = await import('drizzle-orm')
  const { readFileSync } = await import('node:fs')

  mkdirSync(join(dir, 'host-tus'), { recursive: true })
  const tus = new TusServer({
    path: '/tusupload',
    datastore: new FileStore({ directory: join(dir, 'host-tus') }),
    relativeLocation: true,
    allowedOrigins: [],
    onUploadCreate: async (req, upload) => {
      const header = (name: string) => req.headers.get(name) ?? ''
      const expected = createHash('sha256').update(CONFIG.libraryId + CONFIG.apiKey + header('authorizationexpire') + header('videoid')).digest('hex')
      if (expected !== header('authorizationsignature') || Number(header('authorizationexpire')) * 1000 < Date.now()) {
        seen.badSignatures += 1
        throw { status_code: 401, body: 'bad signature' }
      }
      if (failing.tus > 0) {
        failing.tus -= 1
        throw { status_code: 500, body: 'host is having trouble' }
      }
      return { metadata: { ...upload.metadata, videoId: header('videoid') } }
    },
    onUploadFinish: async (_req, upload) => {
      seen.received.set(upload.metadata!.videoId!, readFileSync(join(dir, 'host-tus', upload.id)))
      return {}
    },
  })
  let counter = 0
  host = createServer((req, res) => {
    const url = req.url ?? ''
    if (url.startsWith('/tusupload')) return void tus.handle(req, res)
    if (req.method === 'POST' && /\/library\/\d+\/videos$/.test(url)) {
      if (failing.create > 0) {
        failing.create -= 1
        res.statusCode = 500
        return void res.end('{}')
      }
      const guid = `host-video-${++counter}`
      seen.created.push(guid)
      res.setHeader('content-type', 'application/json')
      return void res.end(JSON.stringify({ guid }))
    }
    const del = /\/videos\/([^/]+)$/.exec(url)
    if (req.method === 'DELETE' && del) {
      seen.deleted.push(del[1]!)
      return void res.end('{}')
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve))
  process.env.BUNNY_API_BASE = `http://127.0.0.1:${(host.address() as { port: number }).port}`
})
afterAll(async () => {
  delete process.env.BUNNY_API_BASE
  await new Promise(resolve => host.close(resolve))
  rmSync(dir, { recursive: true, force: true })
})

let n = 0
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const account = () => {
  const now = new Date()
  return db.insert(schema.user).values({ id: `vp-u-${++n}`, name: 'Volunteer', email: `vp${n}@example.org`, emailVerified: true, createdAt: now, updatedAt: now }).returning().get().id
}
const message = (over: Partial<typeof schema.sermons.$inferInsert> = {}) =>
  db.insert(schema.sermons).values({ slug: `2026-11-02-vp-${++n}`, title: `Message ${n}`, preachedOn: '2026-11-02', speaker: 'Speaker', status: 'draft', visibility: 'members', ...over }).returning().get()

// A message with a stored copy on disk, as the upload step leaves it.
const withStoredCopy = (data: Buffer = randomBytes(2_500_000)) => {
  const row = message()
  const relativePath = `2026/${row.slug}/original.mp4`
  const full = join(folder, relativePath)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, data)
  db.insert(schema.sermonFiles).values({ sermonId: row.id, relativePath, fileName: 'a.mp4', size: data.length, sha256: sha(data) }).run()
  return { row, data, full }
}
const reset = () => { seen.created.length = 0; seen.deleted.length = 0; seen.received.clear(); seen.badSignatures = 0; failing.create = 0; failing.tus = 0 }

describe('sending a stored video to the host', () => {
  it('sends every byte, in pieces, signed as the host checks, and notes it as on its way', async () => {
    reset()
    const { row, data } = withStoredCopy(randomBytes(3_500_000))
    expect(await push.pushToHost(row.id, { config: CONFIG, folder, pieceBytes: 1024 * 1024 })).toBe('sent')

    const guid = seen.created[0]!
    expect(seen.badSignatures).toBe(0)
    expect(seen.received.get(guid)!.equals(data)).toBe(true)
    expect(lib.loadSermon({ id: row.id })).toMatchObject({ hostedVideoId: guid, hostedVideoState: 'processing' })
    expect(push.loadPush(row.id)).toMatchObject({ state: 'sent', attempts: 1, lastError: null, sha256: sha(data) })
  })

  it('replaces an earlier copy on the host only after the new one has fully arrived', async () => {
    reset()
    const { row } = withStoredCopy()
    db.update(schema.sermons).set({ hostedVideoId: 'old-video', hostedVideoState: 'ready' }).where(orm.eq(schema.sermons.id, row.id)).run()
    await push.pushToHost(row.id, { config: CONFIG, folder })
    expect(lib.loadSermon({ id: row.id })!.hostedVideoId).toBe(seen.created[0])
    expect(seen.deleted).toEqual(['old-video'])
  })

  it('leaves a video that works alone when the host will not make a new one', async () => {
    reset()
    const { row } = withStoredCopy()
    db.update(schema.sermons).set({ hostedVideoId: 'works', hostedVideoState: 'ready' }).where(orm.eq(schema.sermons.id, row.id)).run()
    failing.create = 1
    expect(await push.pushToHost(row.id, { config: CONFIG, folder })).toBe('failed')
    expect(lib.loadSermon({ id: row.id })).toMatchObject({ hostedVideoId: 'works', hostedVideoState: 'ready' })
    expect(push.loadPush(row.id)).toMatchObject({ state: 'failed', attempts: 1 })
    expect(push.loadPush(row.id)!.lastError).toBeTruthy()
  })

  it('removes the half-made copy on the host when the upload fails, and keeps the old one', async () => {
    reset()
    const { row } = withStoredCopy()
    db.update(schema.sermons).set({ hostedVideoId: 'works', hostedVideoState: 'ready' }).where(orm.eq(schema.sermons.id, row.id)).run()
    failing.tus = 5
    expect(await push.pushToHost(row.id, { config: CONFIG, folder, retryDelays: [0, 5] })).toBe('failed')
    expect(seen.deleted).toEqual(seen.created)
    expect(seen.created).toHaveLength(1)
    expect(lib.loadSermon({ id: row.id })!.hostedVideoId).toBe('works')
  })

  it('fails with a plain reason if the stored file is missing or not the size it was', async () => {
    reset()
    const missing = withStoredCopy()
    rmSync(missing.full)
    expect(await push.pushToHost(missing.row.id, { config: CONFIG, folder })).toBe('failed')
    expect(push.loadPush(missing.row.id)!.lastError).toBeTruthy()
    const changed = withStoredCopy()
    writeFileSync(changed.full, 'different')
    expect(await push.pushToHost(changed.row.id, { config: CONFIG, folder })).toBe('failed')
    expect(push.loadPush(changed.row.id)!.lastError).toMatch(/not the size/)
    expect(seen.created).toHaveLength(0)
  })

  it('does nothing for a message with no stored copy, or one already sent in this version', async () => {
    reset()
    expect(await push.pushToHost(message().id, { config: CONFIG, folder })).toBe('skipped')
    const { row } = withStoredCopy()
    await push.pushToHost(row.id, { config: CONFIG, folder })
    const created = seen.created.length
    expect(await push.pushToHost(row.id, { config: CONFIG, folder })).toBe('skipped')
    expect(seen.created).toHaveLength(created)
  })

  it('sends again when the stored file has been replaced', async () => {
    reset()
    const { row, full } = withStoredCopy()
    await push.pushToHost(row.id, { config: CONFIG, folder })
    const replacement = randomBytes(1_000_000)
    writeFileSync(full, replacement)
    db.update(schema.sermonFiles).set({ size: replacement.length, sha256: sha(replacement) }).where(orm.eq(schema.sermonFiles.sermonId, row.id)).run()
    push.queuePush(row.id, sha(replacement))
    expect(await push.pushToHost(row.id, { config: CONFIG, folder })).toBe('sent')
    expect(seen.received.get(seen.created.at(-1)!)!.equals(replacement)).toBe(true)
    expect(seen.deleted).toContain(seen.created[0])
  })

  it('removes what it sent if the message was deleted while it was sending', async () => {
    reset()
    const { row } = withStoredCopy()
    const upload = vi.fn(async () => { db.delete(schema.sermons).where(orm.eq(schema.sermons.id, row.id)).run() })
    expect(await push.pushToHost(row.id, { config: CONFIG, folder, upload })).toBe('skipped')
    expect(seen.deleted).toEqual(seen.created)
  })
})

describe('trying again', () => {
  it('waits longer after each failure, up to an hour', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 12].map(push.retryDelaySeconds)).toEqual([60, 120, 240, 480, 960, 1920, 3600, 3600, 3600])
  })

  it('schedules the next try after a failure, and says whether it will retry', async () => {
    reset()
    const { row } = withStoredCopy()
    failing.create = 1
    const at = Date.UTC(2026, 10, 2, 12, 0, 0)
    await push.pushToHost(row.id, { config: CONFIG, folder, now: () => at })
    const recorded = push.loadPush(row.id)!
    expect(recorded.nextAttemptAt.getTime()).toBe(at + 60_000)
    const view = (await import('../../shared/hosted-video')).presentPush(recorded)!
    expect(view).toMatchObject({ state: 'failed', attempts: 1, willRetry: true })
    expect(view.error).toBeTruthy()
    const spent = (await import('../../shared/hosted-video')).presentPush({ state: 'failed', attempts: 8, lastError: 'x' })!
    expect(spent.willRetry).toBe(false)
    expect((await import('../../shared/hosted-video')).presentPush({ state: 'sent', attempts: 1, lastError: null })!.error).toBeNull()
  })

  it('starts over when a person presses Send, but only for a message with a stored copy', () => {
    const { row } = withStoredCopy()
    push.queuePush(row.id, 'x')
    db.update(schema.videoPushes).set({ state: 'failed', attempts: 8, lastError: 'boom' }).where(orm.eq(schema.videoPushes.sermonId, row.id)).run()
    expect(push.retryPush(row.id)).toBe(true)
    expect(push.loadPush(row.id)).toMatchObject({ state: 'queued', attempts: 0, lastError: null })
    expect(push.retryPush(message().id)).toBe(false)
  })
})

describe('the background worker', () => {
  const fakeFetch = () => vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
    init?.method === 'POST' ? new Response(JSON.stringify({ guid: `w-${++n}` }), { status: 200 }) : new Response('{}', { status: 200 })) as unknown as typeof fetch
  const upload = () => vi.fn(async () => {})

  const stateOf = (id: string) => push.loadPush(id)!.state
  const setPush = (id: string, set: Partial<typeof schema.videoPushes.$inferInsert>) =>
    db.update(schema.videoPushes).set(set).where(orm.eq(schema.videoPushes.sermonId, id)).run()

  it('sends what is waiting, retries what is due, and leaves the rest', async () => {
    db.delete(schema.videoPushes).run()
    const now = Date.now()
    const queued = withStoredCopy().row.id
    const dueFailed = withStoredCopy().row.id
    const notYet = withStoredCopy().row.id
    const spent = withStoredCopy().row.id
    const done = withStoredCopy().row.id
    const fresh = withStoredCopy().row.id
    const stale = withStoredCopy().row.id
    for (const id of [queued, dueFailed, notYet, spent, done, fresh, stale]) push.queuePush(id, 'sha', new Date(now - 1000))
    setPush(dueFailed, { state: 'failed', attempts: 2, nextAttemptAt: new Date(now - 1000) })
    setPush(notYet, { state: 'failed', attempts: 2, nextAttemptAt: new Date(now + 3_600_000) })
    setPush(spent, { state: 'failed', attempts: 8, nextAttemptAt: new Date(now - 1000) })
    setPush(done, { state: 'sent' })
    setPush(fresh, { state: 'sending', updatedAt: new Date(now - 1000) })
    setPush(stale, { state: 'sending', updatedAt: new Date(now - 4 * 3_600_000) })

    const result = await push.runPushes({ config: CONFIG, folder, upload: upload(), doFetch: fakeFetch(), now: () => now })
    expect(result).toMatchObject({ busy: false, failed: 0 })
    expect(result.sent).toBe(3)
    expect(stateOf(queued)).toBe('sent')
    expect(stateOf(dueFailed)).toBe('sent')
    expect(stateOf(stale)).toBe('sent')
    expect(stateOf(notYet)).toBe('failed')
    expect(stateOf(spent)).toBe('failed')
    expect(stateOf(done)).toBe('sent')
    expect(stateOf(fresh)).toBe('sending')
  })

  it('sends one at a time: a second call while one is working leaves it alone', async () => {
    db.delete(schema.videoPushes).run()
    const a = withStoredCopy().row.id
    push.queuePush(a, 'sha')
    let release!: () => void
    const slow = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const first = push.runPushes({ config: CONFIG, folder, upload: slow, doFetch: fakeFetch() })
    await vi.waitFor(() => expect(slow).toHaveBeenCalled())
    expect(await push.runPushes({ config: CONFIG, folder, upload: upload(), doFetch: fakeFetch() })).toMatchObject({ busy: true, sent: 0 })
    release()
    expect((await first).sent).toBe(1)
  })
})

describe('publishing when the video is ready, while it is still on its way', () => {
  it('can be asked for while a send to the host is waiting or retrying, but not once it has given up', () => {
    const who = account()
    const waiting = withStoredCopy().row
    push.queuePush(waiting.id, 'sha')
    expect(() => hosted.setPublishWhenReady(waiting.id, who)).not.toThrow()

    const retrying = withStoredCopy().row
    push.queuePush(retrying.id, 'sha')
    db.update(schema.videoPushes).set({ state: 'failed', attempts: 3 }).where(orm.eq(schema.videoPushes.sermonId, retrying.id)).run()
    expect(() => hosted.setPublishWhenReady(retrying.id, who)).not.toThrow()

    const gaveUp = withStoredCopy().row
    push.queuePush(gaveUp.id, 'sha')
    db.update(schema.videoPushes).set({ state: 'failed', attempts: 8 }).where(orm.eq(schema.videoPushes.sermonId, gaveUp.id)).run()
    expect(() => hosted.setPublishWhenReady(gaveUp.id, who)).toThrow(/Upload a video first/)
  })

  it('still needs something to wait for', () => {
    expect(() => hosted.setPublishWhenReady(message().id, account())).toThrow(/Upload a video first/)
  })
})

describe('what the screens are told', () => {
  it('shows the state of a send with the message, and nothing when none was asked for', () => {
    const { row } = withStoredCopy()
    expect(lib.presentAdminSermon(lib.loadSermon({ id: row.id })!).hostPush).toBeNull()
    push.queuePush(row.id, 'sha')
    expect(lib.presentAdminSermon(lib.loadSermon({ id: row.id })!).hostPush).toMatchObject({ state: 'queued', attempts: 0, willRetry: false })
  })
})

// ---------------------------------------------------------------------------------------------
// Sending to the church's YouTube channel. Google is faked: its sign-in and lookup answers come from a
// router, and its resumable upload address is a real local server that can drop the connection.

describe('sending a stored video to YouTube', () => {
  const YT = { clientId: 'cid', clientSecret: 'csecret', redirectUri: 'https://church.example/api/admin/youtube/callback' }
  let upload: HttpServer
  let uploadUrl = ''
  const received = { bytes: Buffer.alloc(0), putStarts: [] as number[], dropNext: false, videoId: 'yt-video-1' }
  let channelOfVideo = 'UC-church'
  const calls: Array<{ url: string, method: string, headers: Headers, body: string | null }> = []

  beforeAll(async () => {
    upload = createServer((req, res) => {
      const range = /bytes (\d+)-(\d+)\/(\d+)|bytes \*\/(\d+)/.exec(String(req.headers['content-range'] ?? ''))
      const chunks: Buffer[] = []
      req.on('data', chunk => chunks.push(chunk))
      const finish = () => {
        const body = Buffer.concat(chunks)
        if (range?.[4]) { // a question: how much do you have?
          res.statusCode = 308
          if (received.bytes.length) res.setHeader('range', `bytes=0-${received.bytes.length - 1}`)
          return void res.end()
        }
        const start = Number(range![1])
        received.putStarts.push(start)
        received.bytes = Buffer.concat([received.bytes.subarray(0, start), body])
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ id: received.videoId }))
      }
      if (received.dropNext) {
        received.dropNext = false
        // Take part of the file, then lose the connection.
        let got = 0
        req.on('data', (chunk) => {
          got += chunk.length
          if (got > 500_000) {
            const partial = Buffer.concat(chunks)
            const start = Number(range![1])
            received.putStarts.push(start)
            received.bytes = Buffer.concat([received.bytes.subarray(0, start), partial])
            req.socket.destroy()
          }
        })
        return
      }
      req.on('end', finish)
    })
    await new Promise<void>(resolve => upload.listen(0, '127.0.0.1', resolve))
    uploadUrl = `http://127.0.0.1:${(upload.address() as { port: number }).port}/session`
  })
  afterAll(async () => { await new Promise(resolve => upload.close(resolve)) })

  // Google's answers to the site's own calls.
  const google = (over: { noLocation?: boolean } = {}) => vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: (init?.body as string | undefined) ?? null })
    if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'fresh-access' }), { status: 200 })
    if (u.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')) return new Response('{}', { status: 200, headers: over.noLocation ? {} : { location: uploadUrl } })
    if (u.startsWith('https://www.googleapis.com/youtube/v3/videos')) return new Response(JSON.stringify({ items: [{ snippet: { channelId: channelOfVideo } }] }), { status: 200 })
    return new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
  const quick = { sleep: async () => {}, retryDelays: [0, 0, 0] }
  const connect = async () => {
    const yt = await import('../../server/lib/youtube')
    yt.deleteConnection()
    yt.saveConnection({ id: 'UC-church', title: 'Church' }, 'saved-refresh-token', account())
  }
  const fresh = () => { received.bytes = Buffer.alloc(0); received.putStarts = []; received.dropNext = false; calls.length = 0; channelOfVideo = 'UC-church'; reset() }

  it('sends every byte, unlisted, and points the message at the new YouTube video', async () => {
    fresh(); await connect()
    const { row, data } = withStoredCopy(randomBytes(1_500_000))
    expect(await push.pushToYouTube(row.id, { config: YT, folder, doFetch: google(), ...quick })).toBe('sent')

    expect(received.bytes.equals(data)).toBe(true)
    const start = calls.find(c => c.url.startsWith('https://www.googleapis.com/upload'))!
    expect(JSON.parse(start.body!)).toMatchObject({ snippet: { title: row.title }, status: { privacyStatus: 'unlisted' } })
    expect(start.headers.get('x-upload-content-length')).toBe(String(data.length))
    expect(start.headers.get('x-upload-content-type')).toBe('video/mp4')
    expect(start.headers.get('origin')).toBeNull()
    expect(lib.loadSermon({ id: row.id })).toMatchObject({ videoProvider: 'youtube', videoId: 'yt-video-1' })
    expect(push.loadPush(row.id, 'youtube')).toMatchObject({ state: 'sent', attempts: 1 })
    const entries = db.select().from(schema.auditLog).where(orm.eq(schema.auditLog.entityId, row.id)).all()
    expect(entries.map(e => e.action)).toContain('sermon.youtube')
  })

  it('picks up where it left off when the connection drops, sending only the rest', async () => {
    fresh(); await connect()
    const { row, data } = withStoredCopy(randomBytes(3_000_000))
    received.dropNext = true
    expect(await push.pushToYouTube(row.id, { config: YT, folder, doFetch: google(), ...quick })).toBe('sent')
    expect(received.bytes.equals(data)).toBe(true)
    expect(received.putStarts[0]).toBe(0)
    expect(received.putStarts.at(-1)!).toBeGreaterThan(0)
  })

  it('does not point the message at a video that is not on the church’s channel', async () => {
    fresh(); await connect()
    const { row } = withStoredCopy()
    db.update(schema.sermons).set({ videoProvider: 'youtube', videoId: 'earlier' }).where(orm.eq(schema.sermons.id, row.id)).run()
    channelOfVideo = 'UC-someone-else'
    expect(await push.pushToYouTube(row.id, { config: YT, folder, doFetch: google(), ...quick })).toBe('failed')
    expect(lib.loadSermon({ id: row.id })!.videoId).toBe('earlier')
    expect(push.loadPush(row.id, 'youtube')!.lastError).toMatch(/not on the church/)
  })

  it('says plainly when the channel is not connected, and when YouTube will not start the upload', async () => {
    fresh()
    const yt = await import('../../server/lib/youtube')
    yt.deleteConnection()
    const a = withStoredCopy().row
    expect(await push.pushToYouTube(a.id, { config: YT, folder, doFetch: google(), ...quick })).toBe('failed')
    expect(push.loadPush(a.id, 'youtube')!.lastError).toMatch(/not connected/)
    await connect()
    const b = withStoredCopy().row
    expect(await push.pushToYouTube(b.id, { config: YT, folder, doFetch: google({ noLocation: true }), ...quick })).toBe('failed')
    expect(push.loadPush(b.id, 'youtube')!.lastError).toMatch(/would not start/)
    expect(lib.loadSermon({ id: b.id })!.videoId).toBeNull()
  })

  it('replaces a YouTube link the message already had', async () => {
    fresh(); await connect()
    const { row } = withStoredCopy()
    db.update(schema.sermons).set({ videoProvider: 'youtube', videoId: 'the-old-link' }).where(orm.eq(schema.sermons.id, row.id)).run()
    await push.pushToYouTube(row.id, { config: YT, folder, doFetch: google(), ...quick })
    expect(lib.loadSermon({ id: row.id })!.videoId).toBe('yt-video-1')
  })

  it('publishes a draft that asked to, when there is no video host copy to wait for', async () => {
    fresh(); await connect()
    const who = account()
    const { row } = withStoredCopy()
    db.update(schema.sermons).set({ publishWhenReadyBy: who }).where(orm.eq(schema.sermons.id, row.id)).run()
    await push.pushToYouTube(row.id, { config: YT, folder, doFetch: google(), ...quick })
    const after = lib.loadSermon({ id: row.id })!
    expect(after).toMatchObject({ status: 'published', publishWhenReadyBy: null })
    const publish = db.select().from(schema.auditLog).where(orm.eq(schema.auditLog.entityId, row.id)).all().find(e => e.action === 'sermon.publish')
    expect(publish).toMatchObject({ actorUserId: who })
  })

  it('leaves publishing to the video host when a copy there is still on its way', async () => {
    fresh(); await connect()
    const { row } = withStoredCopy()
    db.update(schema.sermons).set({ publishWhenReadyBy: account() }).where(orm.eq(schema.sermons.id, row.id)).run()
    push.queuePush(row.id, 'sha', new Date(), 'host')
    await push.pushToYouTube(row.id, { config: YT, folder, doFetch: google(), ...quick })
    expect(lib.loadSermon({ id: row.id })).toMatchObject({ status: 'draft' })
    expect(lib.loadSermon({ id: row.id })!.publishWhenReadyBy).not.toBeNull()
  })

  it('sends the host and YouTube independently, and leaves a place that is not connected waiting', async () => {
    fresh(); await connect()
    db.delete(schema.videoPushes).run()
    const { row } = withStoredCopy()
    push.queuePush(row.id, 'sha', new Date(), 'host')
    push.queuePush(row.id, 'sha', new Date(), 'youtube')
    // Only YouTube is connected: the host's send waits.
    const result = await push.runPushes({ config: null, youtube: YT, folder, doFetch: google(), ...quick })
    expect(result).toMatchObject({ sent: 1, failed: 0 })
    expect(push.loadPush(row.id, 'youtube')!.state).toBe('sent')
    expect(push.loadPush(row.id, 'host')!.state).toBe('queued')
  })

  it('shows each place’s send on the message, and lets publish-when-ready wait on either', () => {
    const who = account()
    const { row } = withStoredCopy()
    expect(lib.presentAdminSermon(lib.loadSermon({ id: row.id })!)).toMatchObject({ hostPush: null, youtubePush: null })
    push.queuePush(row.id, 'sha', new Date(), 'youtube')
    expect(lib.presentAdminSermon(lib.loadSermon({ id: row.id })!)).toMatchObject({ hostPush: null, youtubePush: { state: 'queued' } })
    expect(() => hosted.setPublishWhenReady(row.id, who)).not.toThrow()
    db.update(schema.videoPushes).set({ state: 'failed', attempts: 8 }).where(orm.eq(schema.videoPushes.sermonId, row.id)).run()
    // Once it has given up there is nothing left to wait for.
    expect(() => hosted.setPublishWhenReady(row.id, who)).toThrow(/Upload a video first/)
  })

  it('leaves a YouTube send waiting when the channel is not connected, without calling it a failure', async () => {
    fresh()
    db.delete(schema.videoPushes).run()
    const { row } = withStoredCopy()
    push.queuePush(row.id, 'sha', new Date(), 'youtube')
    const result = await push.runPushes({ config: null, youtube: null, folder, doFetch: google(), ...quick })
    expect(result).toMatchObject({ sent: 0, failed: 0 })
    expect(push.loadPush(row.id, 'youtube')).toMatchObject({ state: 'queued', attempts: 0 })
  })
})

describe('what to send on once a video is filed', () => {
  it('sends to the video host whenever it is connected, and to YouTube only if asked and connected', () => {
    const queue = (wishes: { youtube: boolean }, connected: { host: boolean, youtube: boolean }) => {
      const { row, data } = withStoredCopy(randomBytes(10))
      return { id: row.id, queued: push.queueSends(row.id, sha(data), wishes, connected) }
    }
    expect(queue({ youtube: true }, { host: true, youtube: true }).queued).toEqual(['host', 'youtube'])
    expect(queue({ youtube: false }, { host: true, youtube: true }).queued).toEqual(['host'])
    expect(queue({ youtube: true }, { host: false, youtube: true }).queued).toEqual(['youtube'])
    expect(queue({ youtube: true }, { host: true, youtube: false }).queued).toEqual(['host'])
    expect(queue({ youtube: true }, { host: false, youtube: false }).queued).toEqual([])
  })

  it('records the file’s checksum so a replaced file is sent again', () => {
    const { row, data } = withStoredCopy(randomBytes(10))
    push.queueSends(row.id, sha(data), { youtube: true }, { host: true, youtube: true })
    expect(push.loadPush(row.id, 'host')).toMatchObject({ state: 'queued', sha256: sha(data), attempts: 0 })
    expect(push.loadPush(row.id, 'youtube')).toMatchObject({ state: 'queued', sha256: sha(data) })
  })
})
