// A message's own hosted copy of its video (Bunny Stream), next to a YouTube link.
// The host is faked: nothing here reaches the network.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { detailsFromFileName, playerSource } from '../../shared/hosted-video'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-hosted-video-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let lib: typeof import('../../server/lib/sermons')
let hosted: typeof import('../../server/lib/hosted-video')
let bunny: typeof import('../../server/lib/bunny')
let orm: typeof import('drizzle-orm')

const CONFIG = { libraryId: '123', apiKey: 'api-key', tokenKey: 'token-key' }

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/sermons')
  hosted = await import('../../server/lib/hosted-video')
  bunny = await import('../../server/lib/bunny')
  orm = await import('drizzle-orm')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))
afterEach(() => {
  delete process.env.BUNNY_LIBRARY_ID
  delete process.env.BUNNY_API_KEY
  delete process.env.BUNNY_TOKEN_KEY
})

let counter = 0
const message = (over: Partial<typeof schema.sermons.$inferInsert> = {}) => {
  const n = ++counter
  return db.insert(schema.sermons).values({ slug: `hv-${n}`, title: `Message ${n}`, preachedOn: '2026-01-01', speaker: 'Speaker', status: 'published', visibility: 'public', ...over }).returning().get()
}
const account = () => {
  const n = ++counter
  const now = new Date()
  return db.insert(schema.user).values({ id: `hv-u-${n}`, name: `Volunteer ${n}`, email: `volunteer${n}@example.org`, emailVerified: true, createdAt: now, updatedAt: now }).returning().get().id
}
const auditFor = (id: string) => db.select().from(schema.auditLog).where(orm.eq(schema.auditLog.entityId, id)).all()
const statusOf = async (fn: () => unknown) => {
  try { await fn() }
  catch (error) { return (error as { statusCode?: number }).statusCode }
  return undefined
}

// A fake host: records every request and answers from a script.
const fakeHost = (answers: Array<{ ok?: boolean, status?: number, body?: unknown }>) => {
  const calls: Array<{ url: string, method: string, key: string | null, body: string | null }> = []
  const doFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    calls.push({ url: String(url), method: init?.method ?? 'GET', key: headers.get('AccessKey'), body: (init?.body as string | undefined) ?? null })
    const answer = answers.shift() ?? { ok: true, body: {} }
    return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? (answer.ok === false ? 500 : 200) })
  }) as unknown as typeof fetch
  return { doFetch, calls }
}

describe('which video the player uses', () => {
  it('prefers our hosted copy once it is ready, and otherwise the YouTube video', () => {
    expect(playerSource({ hosted: { state: 'ready' }, youtubeId: 'abc' })).toBe('hosted')
    expect(playerSource({ hosted: { state: 'ready' }, youtubeId: null })).toBe('hosted')
    expect(playerSource({ hosted: null, youtubeId: 'abc' })).toBe('youtube')
    expect(playerSource({ hosted: null, youtubeId: null })).toBe('none')
  })

  it('never lets a copy that is not ready hide a YouTube video that works', () => {
    expect(playerSource({ hosted: { state: 'processing' }, youtubeId: 'abc' })).toBe('youtube')
    expect(playerSource({ hosted: { state: 'failed' }, youtubeId: 'abc' })).toBe('youtube')
    expect(playerSource({ hosted: { state: 'processing' }, youtubeId: null })).toBe('none')
  })
})

describe('the video host connection', () => {
  it('is off until all three settings are given', () => {
    expect(bunny.bunnyConfig()).toBeNull()
    process.env.BUNNY_LIBRARY_ID = '123'
    process.env.BUNNY_API_KEY = 'api-key'
    expect(bunny.bunnyConfig()).toBeNull()
    process.env.BUNNY_TOKEN_KEY = 'token-key'
    expect(bunny.bunnyConfig()).toEqual(CONFIG)
  })

  it('signs a play link from the token key, the video and the time, as the host checks it', () => {
    const url = bunny.embedUrl(CONFIG, 'vid-1', 1700000000)
    expect(url).toBe('https://iframe.mediadelivery.net/embed/123/vid-1?token=beebf31b8da96e5d3f7d3e179f5c3dfa3fa30eedaa3675e628bea1186a02d32f&expires=1700000000')
    // A different time or video is a different link, so it cannot be lengthened or reused.
    expect(bunny.embedUrl(CONFIG, 'vid-1', 1700000001)).not.toBe(url)
    expect(bunny.embedUrl(CONFIG, 'vid-2', 1700000000)).not.toBe(url)
  })

  it('signs an upload from the library, the API key, the time and the video, without revealing the key', () => {
    const ticket = bunny.uploadTicket(CONFIG, 'vid-1', 1700021600)
    expect(ticket).toEqual({
      endpoint: 'https://video.bunnycdn.com/tusupload',
      libraryId: '123',
      videoId: 'vid-1',
      expires: 1700021600,
      signature: 'cf23a301222931a12114c4cf4df5cea715ea2dfcda82cc12185adc2c480bec16',
    })
    expect(JSON.stringify(ticket)).not.toContain('api-key')
    expect(JSON.stringify(ticket)).not.toContain('token-key')
  })

  it('reads the host’s video status as processing, ready or failed', () => {
    expect([0, 1, 2, 3, 7, 8].map(bunny.stateFromStatus)).toEqual(Array(6).fill('processing'))
    expect(bunny.stateFromStatus(4)).toBe('ready')
    expect(bunny.stateFromStatus(5)).toBe('failed')
    expect(bunny.stateFromStatus(6)).toBe('failed')
  })
})

describe('starting a hosted copy', () => {
  it('creates the video on the host, remembers it as processing, and returns an upload ticket', async () => {
    const row = message({ title: 'The Good Shepherd' })
    const host = fakeHost([{ body: { guid: 'new-guid' } }])
    const ticket = await hosted.startHostedVideo(CONFIG, row.id, undefined, 1700000000000, host.doFetch)

    expect(host.calls).toHaveLength(1)
    expect(host.calls[0]).toMatchObject({ url: 'https://video.bunnycdn.com/library/123/videos', method: 'POST', key: 'api-key' })
    expect(JSON.parse(host.calls[0]!.body!)).toEqual({ title: 'The Good Shepherd' })
    expect(ticket).toMatchObject({ videoId: 'new-guid', libraryId: '123', expires: 1700000000 + bunny.UPLOAD_TICKET_SECONDS })

    const after = lib.loadSermon({ id: row.id })!
    expect(after).toMatchObject({ hostedVideoId: 'new-guid', hostedVideoState: 'processing' })
    expect(lib.presentSermon(after).hosted).toEqual({ state: 'processing' })
  })

  it('removes an earlier copy only after the new one is recorded', async () => {
    const row = message({ hostedVideoId: 'old-guid', hostedVideoState: 'ready' })
    const host = fakeHost([{ body: { guid: 'new-guid' } }, { ok: true }])
    await hosted.startHostedVideo(CONFIG, row.id, undefined, 0, host.doFetch)
    expect(host.calls.map(c => c.method)).toEqual(['POST', 'DELETE'])
    expect(host.calls[1]!.url).toContain('/videos/old-guid')
    expect(lib.loadSermon({ id: row.id })!.hostedVideoId).toBe('new-guid')
  })

  it('leaves the existing copy alone when the host will not make a new one', async () => {
    const row = message({ hostedVideoId: 'old-guid', hostedVideoState: 'ready' })
    const host = fakeHost([{ ok: false, status: 500 }])
    expect(await statusOf(() => hosted.startHostedVideo(CONFIG, row.id, undefined, 0, host.doFetch))).toBe(502)
    expect(lib.loadSermon({ id: row.id })).toMatchObject({ hostedVideoId: 'old-guid', hostedVideoState: 'ready' })
    expect(host.calls).toHaveLength(1)
  })

  it('refuses a message that does not exist', async () => {
    const host = fakeHost([])
    expect(await statusOf(() => hosted.startHostedVideo(CONFIG, 'missing', undefined, 0, host.doFetch))).toBe(404)
    expect(host.calls).toHaveLength(0)
  })

  it('records the change in the same step as the audit entry', async () => {
    const row = message()
    const host = fakeHost([{ body: { guid: 'g' } }])
    const audit = vi.fn()
    await hosted.startHostedVideo(CONFIG, row.id, audit, 0, host.doFetch)
    expect(audit).toHaveBeenCalledOnce()
  })
})

describe('removing a hosted copy', () => {
  it('takes it off the host and off the message, and leaves a YouTube video alone', async () => {
    const row = message({ videoProvider: 'youtube', videoId: 'yt1', hostedVideoId: 'g1', hostedVideoState: 'ready' })
    const host = fakeHost([{ ok: true }])
    expect(await hosted.removeHostedVideo(CONFIG, row.id, undefined, host.doFetch)).toBe(true)
    expect(host.calls[0]).toMatchObject({ method: 'DELETE', key: 'api-key' })
    expect(lib.loadSermon({ id: row.id })).toMatchObject({ hostedVideoId: null, hostedVideoState: null, videoId: 'yt1', videoProvider: 'youtube' })
  })

  it('keeps the copy on the message when the host could not remove it, so it can be tried again', async () => {
    const row = message({ hostedVideoId: 'g2', hostedVideoState: 'ready' })
    const host = fakeHost([{ ok: false, status: 500 }])
    expect(await statusOf(() => hosted.removeHostedVideo(CONFIG, row.id, undefined, host.doFetch))).toBe(502)
    expect(lib.loadSermon({ id: row.id })!.hostedVideoId).toBe('g2')
  })

  it('treats a copy the host no longer has as removed', async () => {
    const row = message({ hostedVideoId: 'g3', hostedVideoState: 'ready' })
    const host = fakeHost([{ ok: false, status: 404 }])
    expect(await hosted.removeHostedVideo(CONFIG, row.id, undefined, host.doFetch)).toBe(true)
    expect(lib.loadSermon({ id: row.id })!.hostedVideoId).toBeNull()
  })

  it('does nothing for a message with no hosted copy', async () => {
    const row = message()
    const host = fakeHost([])
    expect(await hosted.removeHostedVideo(CONFIG, row.id, undefined, host.doFetch)).toBe(false)
    expect(host.calls).toHaveLength(0)
  })
})

describe('checking whether a copy is ready', () => {
  it('asks the host while it is processing, and records ready', async () => {
    const row = message({ hostedVideoId: 'g4', hostedVideoState: 'processing' })
    const host = fakeHost([{ body: { status: 4 } }])
    const after = await hosted.refreshHostedVideo(CONFIG, row.id, host.doFetch)
    expect(after.hostedVideoState).toBe('ready')
    expect(host.calls).toHaveLength(1)
  })

  it('records a failed encode, and keeps waiting while the host is still working', async () => {
    const failed = message({ hostedVideoId: 'g5', hostedVideoState: 'processing' })
    expect((await hosted.refreshHostedVideo(CONFIG, failed.id, fakeHost([{ body: { status: 5 } }]).doFetch)).hostedVideoState).toBe('failed')
    const waiting = message({ hostedVideoId: 'g6', hostedVideoState: 'processing' })
    expect((await hosted.refreshHostedVideo(CONFIG, waiting.id, fakeHost([{ body: { status: 3 } }]).doFetch)).hostedVideoState).toBe('processing')
  })

  it('does not ask again once a copy is ready or failed, or when there is none', async () => {
    const ready = message({ hostedVideoId: 'g7', hostedVideoState: 'ready' })
    const none = message()
    const host = fakeHost([])
    await hosted.refreshHostedVideo(CONFIG, ready.id, host.doFetch)
    await hosted.refreshHostedVideo(CONFIG, none.id, host.doFetch)
    expect(host.calls).toHaveLength(0)
  })

  it('keeps the old state when the host cannot be reached', async () => {
    const row = message({ hostedVideoId: 'g8', hostedVideoState: 'processing' })
    expect(await statusOf(() => hosted.refreshHostedVideo(CONFIG, row.id, fakeHost([{ ok: false, status: 500 }]).doFetch))).toBe(502)
    expect(lib.loadSermon({ id: row.id })!.hostedVideoState).toBe('processing')
  })
})

describe('what the screens are told', () => {
  it('shows only the state of a hosted copy, never its id', () => {
    const row = message({ hostedVideoId: 'secret-guid', hostedVideoState: 'ready' })
    const view = lib.presentSermon(lib.loadSermon({ id: row.id })!)
    expect(view.hosted).toEqual({ state: 'ready' })
    expect(JSON.stringify(view)).not.toContain('secret-guid')
    expect(lib.presentSermon(lib.loadSermon({ id: message().id })!).hosted).toBeNull()
  })
})

describe('publishing a message as soon as its video is ready', () => {
  it('publishes the draft once, in the name of who asked, when the host finishes', async () => {
    const who = account()
    const row = message({ status: 'draft', hostedVideoId: 'p1', hostedVideoState: 'processing' })
    hosted.setPublishWhenReady(row.id, who)
    expect(lib.presentAdminSermon(lib.loadSermon({ id: row.id })!).publishWhenReady).toBe(true)

    const after = await hosted.refreshHostedVideo(CONFIG, row.id, fakeHost([{ body: { status: 4 } }]).doFetch)
    expect(after).toMatchObject({ status: 'published', hostedVideoState: 'ready', publishWhenReadyBy: null })
    expect(after.publishedAt).toBeInstanceOf(Date)
    const entries = auditFor(row.id).filter(e => e.action === 'sermon.publish')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ actorUserId: who })
  })

  it('does not publish while the video is still processing, or when it failed', async () => {
    const who = account()
    const waiting = message({ status: 'draft', hostedVideoId: 'p2', hostedVideoState: 'processing' })
    hosted.setPublishWhenReady(waiting.id, who)
    expect((await hosted.refreshHostedVideo(CONFIG, waiting.id, fakeHost([{ body: { status: 3 } }]).doFetch)).status).toBe('draft')
    const failed = message({ status: 'draft', hostedVideoId: 'p3', hostedVideoState: 'processing' })
    hosted.setPublishWhenReady(failed.id, who)
    expect((await hosted.refreshHostedVideo(CONFIG, failed.id, fakeHost([{ body: { status: 5 } }]).doFetch)).status).toBe('draft')
  })

  it('publishes nothing that nobody asked to publish', async () => {
    const row = message({ status: 'draft', hostedVideoId: 'p4', hostedVideoState: 'processing' })
    expect((await hosted.refreshHostedVideo(CONFIG, row.id, fakeHost([{ body: { status: 4 } }]).doFetch)).status).toBe('draft')
  })

  it('leaves a message published by hand alone, and clears the request', async () => {
    const who = account()
    const row = message({ status: 'draft', hostedVideoId: 'p5', hostedVideoState: 'processing' })
    hosted.setPublishWhenReady(row.id, who)
    db.update(schema.sermons).set({ status: 'published' }).where(orm.eq(schema.sermons.id, row.id)).run()
    const after = await hosted.refreshHostedVideo(CONFIG, row.id, fakeHost([{ body: { status: 4 } }]).doFetch)
    expect(after.publishWhenReadyBy).toBeNull()
    expect(auditFor(row.id).filter(e => e.action === 'sermon.publish')).toHaveLength(0)
  })

  it('can be asked only for a draft that has a video on its way, and can be withdrawn', () => {
    const who = account()
    expect(() => hosted.setPublishWhenReady(message({ status: 'draft' }).id, who)).toThrow(/Upload a video first/)
    expect(() => hosted.setPublishWhenReady(message({ status: 'draft', hostedVideoId: 'p6', hostedVideoState: 'failed' }).id, who)).toThrow(/Upload a video first/)
    expect(() => hosted.setPublishWhenReady(message({ status: 'published', hostedVideoId: 'p7', hostedVideoState: 'processing' }).id, who)).toThrow(/already published/)
    const ok = message({ status: 'draft', hostedVideoId: 'p8', hostedVideoState: 'processing' })
    hosted.setPublishWhenReady(ok.id, who)
    expect(hosted.setPublishWhenReady(ok.id, null).publishWhenReadyBy).toBeNull()
  })

  it('is dropped when the hosted copy is removed', async () => {
    const who = account()
    const row = message({ status: 'draft', hostedVideoId: 'p9', hostedVideoState: 'processing' })
    hosted.setPublishWhenReady(row.id, who)
    await hosted.removeHostedVideo(CONFIG, row.id, undefined, fakeHost([{ ok: true }]).doFetch)
    expect(lib.loadSermon({ id: row.id })!.publishWhenReadyBy).toBeNull()
  })
})

describe('the scheduled check', () => {
  it('finishes every copy still processing, and leaves the rest alone', async () => {
    const one = message({ hostedVideoId: 's1', hostedVideoState: 'processing' })
    const two = message({ hostedVideoId: 's2', hostedVideoState: 'processing' })
    const done = message({ hostedVideoId: 's3', hostedVideoState: 'ready' })
    const asked: string[] = []
    const doFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      asked.push(`${init?.method ?? 'GET'} ${String(url)}`)
      return new Response(JSON.stringify({ status: String(url).endsWith('/s1') ? 4 : 3 }), { status: 200 })
    }) as unknown as typeof fetch
    const result = await hosted.refreshProcessingVideos(CONFIG, doFetch)
    expect(lib.loadSermon({ id: one.id })!.hostedVideoState).toBe('ready')
    expect(lib.loadSermon({ id: two.id })!.hostedVideoState).toBe('processing')
    expect(lib.loadSermon({ id: done.id })!.hostedVideoState).toBe('ready')
    expect(result.checked).toBeGreaterThanOrEqual(2)
    expect(asked.every(call => call.startsWith('GET '))).toBe(true)
    expect(asked.some(call => call.endsWith('/s3'))).toBe(false)
  })

  it('carries on past a copy the host cannot be asked about', async () => {
    const bad = message({ hostedVideoId: 's4', hostedVideoState: 'processing' })
    const good = message({ hostedVideoId: 's5', hostedVideoState: 'processing' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await hosted.refreshProcessingVideos(CONFIG, vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/s4') ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ status: 4 }), { status: 200 })) as unknown as typeof fetch)
    warn.mockRestore()
    expect(lib.loadSermon({ id: bad.id })!.hostedVideoState).toBe('processing')
    expect(lib.loadSermon({ id: good.id })!.hostedVideoState).toBe('ready')
  })
})

describe('a title and date from the file name', () => {
  it('uses the name as the title, without the extension or the underscores', () => {
    expect(detailsFromFileName('The_Good_Shepherd.mp4')).toEqual({ title: 'The Good Shepherd', date: null })
    expect(detailsFromFileName('Sunday Service.MOV')).toEqual({ title: 'Sunday Service', date: null })
    expect(detailsFromFileName('Faith-Filled Living.mp4').title).toBe('Faith-Filled Living')
  })

  it('takes a leading date as the date taught, and leaves the rest as the title', () => {
    expect(detailsFromFileName('2026-11-01_The Good Shepherd.mp4')).toEqual({ title: 'The Good Shepherd', date: '2026-11-01' })
    expect(detailsFromFileName('2026.11.01 - Grace.mp4')).toEqual({ title: 'Grace', date: '2026-11-01' })
    expect(detailsFromFileName('2026-11-01.mp4')).toEqual({ title: '', date: '2026-11-01' })
  })

  it('does not take something that is not a date', () => {
    expect(detailsFromFileName('2026-13-45_Grace.mp4').date).toBeNull()
    expect(detailsFromFileName('20261101_Grace.mp4').date).toBeNull()
    expect(detailsFromFileName('Psalm 23-2026.mp4').date).toBeNull()
  })
})
