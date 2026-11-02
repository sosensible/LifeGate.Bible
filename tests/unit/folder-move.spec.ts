// Moving where the stored videos are kept: changing the folder, keeping a message only on the video
// host, and sending everything again to a new place. Real folders and files; only the host is a stand-in.
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-folder-move-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.BETTER_AUTH_SECRET = 'test-secret-for-the-move-tests-0123456789'
const A = join(dir, 'old-videos')
const B = join(dir, 'new-videos')
const CONFIG = { libraryId: '123', apiKey: 'api-key', tokenKey: 'token-key' }

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let move: typeof import('../../server/lib/folder-move')
let settings: typeof import('../../server/lib/video-settings')
let localVideo: typeof import('../../server/lib/local-video')
let release: typeof import('../../server/lib/local-release')
let push: typeof import('../../server/lib/video-push')
let files: typeof import('../../server/lib/local-files')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  move = await import('../../server/lib/folder-move')
  settings = await import('../../server/lib/video-settings')
  localVideo = await import('../../server/lib/local-video')
  release = await import('../../server/lib/local-release')
  push = await import('../../server/lib/video-push')
  files = await import('../../server/lib/local-files')
  orm = await import('drizzle-orm')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let n = 0
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const account = () => {
  const now = new Date()
  return db.insert(schema.user).values({ id: `fm-u-${++n}`, name: 'Admin', email: `fm${n}@example.org`, emailVerified: true, createdAt: now, updatedAt: now }).returning().get().id
}
const message = (over: Partial<typeof schema.sermons.$inferInsert> = {}) =>
  db.insert(schema.sermons).values({ slug: `2026-11-02-fm-${++n}`, title: `Message ${n}`, preachedOn: '2026-11-02', speaker: 'Speaker', status: 'published', visibility: 'members', ...over }).returning().get()
// A stored video, filed in the folder now in use.
const stored = (data: Buffer = randomBytes(200_000)) => {
  const row = message()
  const relativePath = `2026/${row.slug}/original.mp4`
  const full = join(localVideo.localVideoFolder()!, relativePath)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, data)
  db.insert(schema.sermonFiles).values({ sermonId: row.id, relativePath, fileName: 'a.mp4', size: data.length, sha256: sha(data) }).run()
  return { row, data, relativePath }
}
const statusOf = (fn: () => unknown) => { try { fn() } catch (error) { return (error as { statusCode?: number }).statusCode } return undefined }

// Starts every test from: folder A in use, nothing stored, no move on record.
const fresh = () => {
  db.delete(schema.sermonFiles).run()
  db.delete(schema.folderMoves).run()
  db.delete(schema.integrationSecrets).run()
  db.delete(schema.videoPushes).run()
  rmSync(A, { recursive: true, force: true })
  rmSync(B, { recursive: true, force: true })
  settings.updateVideoSettings({ 'local.path': A }, account())
}
afterEach(() => { /* each test calls fresh() itself */ })

describe('changing the folder', () => {
  it('copies and checks every video, then switches, then clears the old folder', async () => {
    fresh()
    const one = stored(); const two = stored(randomBytes(50_000))
    const started = move.startFolderMove(B, account())
    expect(started).toMatchObject({ state: 'running', filesTotal: 2 })
    expect(await move.runFolderMove()).toBe('done')

    expect(localVideo.localVideoFolder()).toBe(B)
    for (const { data, relativePath } of [one, two]) {
      expect(readFileSync(join(B, relativePath)).equals(data)).toBe(true)
      expect(existsSync(join(A, relativePath))).toBe(false)
    }
    // The records did not change: the paths are relative to the folder.
    expect(db.select().from(schema.sermonFiles).where(orm.eq(schema.sermonFiles.sermonId, one.row.id)).get()!.relativePath).toBe(one.relativePath)
    expect(readdirSync(A)).toEqual([]) // emptied folders are tidied away
    expect(move.presentMove(move.loadMove())).toMatchObject({ state: 'done', filesMoved: 2, bytesMoved: 250_000 })
    expect(db.select().from(schema.auditLog).all().map(e => e.action)).toContain('site.folder_move')
  })

  it('keeps the old folder in use until the move has finished', () => {
    fresh(); stored()
    move.startFolderMove(B, account())
    expect(localVideo.localVideoFolder()).toBe(A)
    expect(move.moveInProgress()).toBe(true)
  })

  it('simply switches when nothing is stored yet', () => {
    fresh()
    expect(move.startFolderMove(B, account())).toMatchObject({ state: 'done', filesTotal: 0 })
    expect(localVideo.localVideoFolder()).toBe(B)
    expect(move.moveInProgress()).toBe(false)
  })

  it('stops, and leaves the old folder untouched and in use, if a stored file no longer matches its checksum', async () => {
    fresh()
    const good = stored(); const damaged = stored()
    writeFileSync(join(A, damaged.relativePath), 'damaged on disk')
    move.startFolderMove(B, account())
    expect(await move.runFolderMove()).toBe('failed')

    expect(move.loadMove()).toMatchObject({ state: 'failed' })
    expect(move.loadMove()!.lastError).toMatch(/checksum/)
    expect(localVideo.localVideoFolder()).toBe(A)
    expect(readFileSync(join(A, good.relativePath)).equals(good.data)).toBe(true)
    expect(existsSync(join(A, damaged.relativePath))).toBe(true)
    expect(readdirSync(join(B, '2026', damaged.row.slug)).filter(name => name.endsWith('.partial'))).toEqual([])
    expect(existsSync(join(B, damaged.relativePath))).toBe(false)
  })

  it('carries on after a failure without copying again what was already copied and checked', async () => {
    fresh()
    const first = stored(); const second = stored()
    const original = readFileSync(join(A, second.relativePath))
    writeFileSync(join(A, second.relativePath), 'damaged on disk')
    move.startFolderMove(B, account())
    await move.runFolderMove()
    // Repair the source, and take the first one's source away: it was already copied, so it is not needed.
    writeFileSync(join(A, second.relativePath), original)
    rmSync(join(A, first.relativePath))
    move.retryFolderMove()
    expect(move.moveInProgress()).toBe(true)
    expect(await move.runFolderMove()).toBe('done')
    expect(localVideo.localVideoFolder()).toBe(B)
    expect(readFileSync(join(B, first.relativePath)).equals(first.data)).toBe(true)
    expect(readFileSync(join(B, second.relativePath)).equals(second.data)).toBe(true)
  })

  it('can be given up on: the copies in the new folder go, the old folder stays in use', async () => {
    fresh()
    const kept = stored()
    const damaged = stored()
    writeFileSync(join(A, damaged.relativePath), 'damaged on disk')
    move.startFolderMove(B, account())
    await move.runFolderMove()
    expect(existsSync(join(B, kept.relativePath)) || existsSync(join(B, damaged.relativePath))).toBe(true)
    move.cancelFolderMove()
    expect(move.loadMove()).toBeUndefined()
    expect(existsSync(join(B, kept.relativePath))).toBe(false)
    expect(readFileSync(join(A, kept.relativePath)).equals(kept.data)).toBe(true)
    expect(localVideo.localVideoFolder()).toBe(A)
    expect(statusOf(() => move.cancelFolderMove())).toBe(409)
  })

  it('refuses a move that cannot work, with a plain reason', () => {
    fresh(); stored()
    expect(statusOf(() => move.startFolderMove(A, account()))).toBe(400) // already the folder
    expect(statusOf(() => move.startFolderMove(join(A, 'inside'), account()))).toBe(400) // inside the old one
    expect(existsSync(join(A, 'inside'))).toBe(false) // and nothing was created in the old folder
    expect(statusOf(() => move.startFolderMove(dir, account()))).toBe(400) // the old one inside it
    expect(statusOf(() => move.startFolderMove('relative/path', account()))).toBe(400)
    const file = join(dir, 'a-plain-file'); writeFileSync(file, 'x')
    expect(statusOf(() => move.startFolderMove(join(file, 'nope'), account()))).toBe(400)
    // No room: a record claiming a huge file.
    db.insert(schema.sermonFiles).values({ sermonId: message().id, relativePath: 'x/huge.mp4', fileName: 'h.mp4', size: 10 ** 15, sha256: 'x' }).run()
    expect(statusOf(() => move.startFolderMove(B, account()))).toBe(409)
    expect(move.loadMove()).toBeUndefined()
  })

  it('refuses a second move while one is running, and a retry when nothing failed', () => {
    fresh(); stored()
    move.startFolderMove(B, account())
    expect(statusOf(() => move.startFolderMove(join(dir, 'third'), account()))).toBe(409)
    expect(statusOf(() => move.retryFolderMove())).toBe(409)
  })

  it('refuses a move when no folder has been chosen yet', () => {
    fresh()
    db.delete(schema.integrationSecrets).run()
    expect(statusOf(() => move.startFolderMove(B, account()))).toBe(409)
  })

  it('holds back new uploads, removals and copies brought in while it runs, and not afterwards', async () => {
    fresh(); stored()
    expect(() => move.refuseDuringMove()).not.toThrow()
    move.startFolderMove(B, account())
    expect(statusOf(() => move.refuseDuringMove())).toBe(409)
    const pulled = await push.pullFromHost(message({ hostedVideoId: 'h', hostedVideoState: 'ready' }).id, { config: CONFIG, cdnHost: 'cdn.example.com', folder: A, doFetch: vi.fn() as unknown as typeof fetch })
    expect(pulled).toBe('skipped')
    await move.runFolderMove()
    expect(() => move.refuseDuringMove()).not.toThrow()
  })
})

describe('changing the folder in the settings while videos are stored', () => {
  it('is refused unless the new folder already holds every stored video', () => {
    fresh(); stored()
    expect(statusOf(() => settings.updateVideoSettings({ 'local.path': B }, account()))).toBe(409)
    expect(localVideo.localVideoFolder()).toBe(A)
    // Saving the folder already in use is fine, and so is turning it off.
    expect(() => settings.updateVideoSettings({ 'local.path': A }, account())).not.toThrow()
    expect(() => settings.updateVideoSettings({ 'local.path': null }, account())).not.toThrow()
  })

  it('allows pointing back at a folder that does hold the videos, for instance after turning it off', () => {
    fresh(); stored()
    settings.updateVideoSettings({ 'local.path': null }, account())
    expect(localVideo.localVideoFolder()).toBeNull()
    expect(statusOf(() => settings.updateVideoSettings({ 'local.path': B }, account()))).toBe(409)
    expect(() => settings.updateVideoSettings({ 'local.path': A }, account())).not.toThrow()
  })

  it('allows any folder when nothing is stored', () => {
    fresh()
    expect(() => settings.updateVideoSettings({ 'local.path': B }, account())).not.toThrow()
  })
})

describe('keeping a message only on the video host', () => {
  const hostSays = (info: Record<string, unknown> | number) => vi.fn(async () =>
    typeof info === 'number' ? new Response('{}', { status: info }) : new Response(JSON.stringify(info), { status: 200 })) as unknown as typeof fetch
  const withHostCopy = (data?: Buffer) => {
    const s = stored(data)
    db.update(schema.sermons).set({ hostedVideoId: 'host-copy', hostedVideoState: 'ready' }).where(orm.eq(schema.sermons.id, s.row.id)).run()
    return s
  }
  const release_ = (id: string, doFetch: typeof fetch) => release.releaseLocalCopy(id, { config: CONFIG, folder: A, userId: account(), doFetch })

  it('removes the church server’s copy once the host holds the same original', async () => {
    fresh(); const s = withHostCopy()
    await release_(s.row.id, hostSays({ hasOriginal: true, originalHash: sha(s.data).toUpperCase() }))
    expect(files.loadLocalFile(s.row.id)).toBeUndefined()
    expect(existsSync(join(A, s.relativePath))).toBe(false)
    expect(db.select().from(schema.auditLog).where(orm.eq(schema.auditLog.entityId, s.row.id)).all().map(e => e.action)).toContain('sermon.local_copy')
  })

  it('removes nothing if the host’s original is a different file, has no checksum, or is gone', async () => {
    fresh(); const s = withHostCopy()
    const keep = async (info: Record<string, unknown> | number) => {
      await expect(release_(s.row.id, hostSays(info))).rejects.toMatchObject({ statusCode: expect.any(Number) })
      expect(files.loadLocalFile(s.row.id)).toBeDefined()
      expect(existsSync(join(A, s.relativePath))).toBe(true)
    }
    await keep({ hasOriginal: true, originalHash: sha(Buffer.from('another file')) })
    await keep({ hasOriginal: true, originalHash: null })
    await keep({ hasOriginal: false })
    await keep(500) // the host could not be asked
  })

  it('removes nothing if the host says it holds no original, whatever else it reports', async () => {
    fresh(); const s = withHostCopy()
    await expect(release_(s.row.id, hostSays({ hasOriginal: false, originalHash: sha(s.data) }))).rejects.toMatchObject({ statusCode: 409 })
    expect(files.loadLocalFile(s.row.id)).toBeDefined()
  })

  it('removes nothing while the host’s copy is still being prepared, even if its original matches', async () => {
    fresh(); const s = withHostCopy()
    db.update(schema.sermons).set({ hostedVideoState: 'processing' }).where(orm.eq(schema.sermons.id, s.row.id)).run()
    await expect(release_(s.row.id, hostSays({ hasOriginal: true, originalHash: sha(s.data) }))).rejects.toMatchObject({ statusCode: 409 })
    expect(files.loadLocalFile(s.row.id)).toBeDefined()
  })

  it('removes nothing when there is no finished copy on the host, or no local copy', async () => {
    fresh()
    const alone = stored()
    await expect(release_(alone.row.id, hostSays({ hasOriginal: true, originalHash: sha(alone.data) }))).rejects.toMatchObject({ statusCode: 409 })
    expect(files.loadLocalFile(alone.row.id)).toBeDefined()
    const none = message({ hostedVideoId: 'h', hostedVideoState: 'ready' })
    await expect(release_(none.id, hostSays({ hasOriginal: true }))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('removes nothing while the stored videos are being moved', async () => {
    fresh(); const s = withHostCopy()
    move.startFolderMove(B, account())
    await expect(release_(s.row.id, hostSays({ hasOriginal: true, originalHash: sha(s.data) }))).rejects.toMatchObject({ statusCode: 409 })
    expect(files.loadLocalFile(s.row.id)).toBeDefined()
  })
})

describe('sending everything again to a new place', () => {
  it('queues every stored video afresh, even ones already sent, and counts them', () => {
    fresh()
    const a = stored(); const b = stored()
    push.queuePush(a.row.id, 'old', new Date(), 'host')
    db.update(schema.videoPushes).set({ state: 'sent', attempts: 3 }).where(orm.eq(schema.videoPushes.sermonId, a.row.id)).run()
    expect(push.resendAll('host')).toBe(2)
    for (const s of [a, b]) expect(push.loadPush(s.row.id, 'host')).toMatchObject({ state: 'queued', attempts: 0, sha256: sha(s.data) })
    expect(push.loadPush(a.row.id, 'youtube')).toBeUndefined()
    expect(push.resendAll('youtube')).toBe(2)
    expect(push.loadPush(b.row.id, 'youtube')).toMatchObject({ state: 'queued' })
  })

  it('queues nothing when nothing is stored', () => {
    fresh()
    expect(push.resendAll('host')).toBe(0)
  })
})
