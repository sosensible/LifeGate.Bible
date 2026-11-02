// The church server's own copy of a message's video: received in resumable pieces, checksummed,
// and filed in the chosen folder. A real upload server runs here; only the sign-in is replaced.
import { createServer, type Server as HttpServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Upload } from 'tus-js-client'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-local-files-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
const folder = join(dir, 'videos')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let files: typeof import('../../server/lib/local-files')
let lib: typeof import('../../server/lib/sermons')
let orm: typeof import('drizzle-orm')
let http: HttpServer
let base = ''
let signedInAs: string | null = null

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  files = await import('../../server/lib/local-files')
  lib = await import('../../server/lib/sermons')
  orm = await import('drizzle-orm')
  // The site reads the signed-in person from the session cookie; here a test names them in a header.
  const whoIs = (req: Request) => req.headers.get('x-test-user')
  http = createServer((req, res) => {
    void files.uploadServer(folder, whoIs).handle(req, res)
  })
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(http.address() as { port: number }).port}`
})
afterAll(async () => {
  await new Promise(resolve => http.close(resolve))
  rmSync(dir, { recursive: true, force: true })
})

let counter = 0
const account = () => {
  const n = ++counter
  const now = new Date()
  return db.insert(schema.user).values({ id: `lf-u-${n}`, name: 'Volunteer', email: `lf${n}@example.org`, emailVerified: true, createdAt: now, updatedAt: now }).returning().get().id
}
const message = (over: Partial<typeof schema.sermons.$inferInsert> = {}) => {
  const n = ++counter
  return db.insert(schema.sermons).values({ slug: `2026-11-01-lf-${n}`, title: `Message ${n}`, preachedOn: '2026-11-01', speaker: 'Speaker', status: 'draft', visibility: 'members', ...over }).returning().get()
}

// Sends bytes to the upload server, as the browser would, and resolves with the HTTP status on failure.
const send = (body: Buffer | Readable, metadata: Record<string, string>, extra: { chunkSize?: number, uploadSize?: number } = {}) =>
  new Promise<{ ok: true } | { ok: false, status: number | null }>((resolve) => {
    const upload = new Upload(body as never, {
      endpoint: `${base}${files.UPLOAD_PATH}`,
      metadata,
      headers: signedInAs ? { 'x-test-user': signedInAs } : {},
      chunkSize: extra.chunkSize ?? 1024 * 1024,
      ...(extra.uploadSize ? { uploadSize: extra.uploadSize } : {}),
      retryDelays: null,
      onError: error => resolve({ ok: false, status: (error as { originalResponse?: { getStatus(): number } }).originalResponse?.getStatus() ?? null }),
      onSuccess: () => resolve({ ok: true }),
    })
    upload.start()
  })
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')

describe('naming and paths', () => {
  it('keeps a sensible extension in lower case, and none if there is not one', () => {
    expect(files.fileExtension('Sunday Service.MP4')).toBe('.mp4')
    expect(files.fileExtension('a.b.mov')).toBe('.mov')
    expect(files.fileExtension('no extension')).toBe('')
    expect(files.fileExtension('weird.toolongext')).toBe('')
  })

  it('files a message under its year and name, relative to the chosen folder', () => {
    expect(files.relativePathFor({ id: 'abcdef12-3456', slug: '2026-11-01-grace', preachedOn: '2026-11-01' }, '.mp4')).toBe('2026/2026-11-01-grace-abcdef12/original.mp4')
  })

  it('refuses a stored path that would land outside the folder', () => {
    expect(files.absolutePath('/srv/videos', '2026/x/original.mp4')).toBe('/srv/videos/2026/x/original.mp4')
    expect(() => files.absolutePath('/srv/videos', '../etc/passwd')).toThrow(/outside/)
    expect(() => files.absolutePath('/srv/videos', '/etc/passwd')).toThrow(/outside/)
  })
})

describe('receiving a video', () => {
  it('stores it in the chosen folder with its checksum, and leaves nothing in the holding folder', async () => {
    const owner = account()
    const row = message()
    signedInAs = owner
    const data = randomBytes(300_000)
    expect(await send(data, { sermonId: row.id, filename: 'Sunday.MP4' })).toEqual({ ok: true })

    const stored = files.loadLocalFile(row.id)!
    expect(stored).toMatchObject({ relativePath: `2026/${row.slug}-${row.id.slice(0, 8)}/original.mp4`, fileName: 'Sunday.MP4', size: 300_000, sha256: sha(data), storedBy: owner })
    expect(readFileSync(join(folder, stored.relativePath)).equals(data)).toBe(true)
    expect(readdirSync(join(folder, files.INCOMING))).toEqual([])
  })

  it('receives a large file in several pieces, and the whole arrives intact', async () => {
    signedInAs = account()
    const row = message()
    const data = randomBytes(3_500_000)
    expect(await send(data, { sermonId: row.id, filename: 'big.mov' }, { chunkSize: 1024 * 1024 })).toEqual({ ok: true })
    const stored = files.loadLocalFile(row.id)!
    expect(stored.size).toBe(3_500_000)
    expect(stored.sha256).toBe(sha(data))
    expect(readFileSync(join(folder, stored.relativePath)).equals(data)).toBe(true)
  })

  it('replaces an earlier copy of the same message, and removes the old file', async () => {
    signedInAs = account()
    const row = message()
    await send(Buffer.from('first video'), { sermonId: row.id, filename: 'a.mp4' })
    const first = files.loadLocalFile(row.id)!
    await send(Buffer.from('second video, different'), { sermonId: row.id, filename: 'b.mov' })
    const second = files.loadLocalFile(row.id)!
    expect(second.relativePath).toMatch(/original\.mov$/)
    expect(existsSync(join(folder, first.relativePath))).toBe(false)
    expect(readFileSync(join(folder, second.relativePath), 'utf8')).toBe('second video, different')
    expect(db.select().from(schema.sermonFiles).where(orm.eq(schema.sermonFiles.sermonId, row.id)).all()).toHaveLength(1)
  })

  it('records who stored it in the audit log', async () => {
    const owner = account()
    signedInAs = owner
    const row = message()
    await send(Buffer.from('audited'), { sermonId: row.id, filename: 'x.mp4' })
    const entries = db.select().from(schema.auditLog).where(orm.eq(schema.auditLog.entityId, row.id)).all()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ action: 'sermon.local_copy', actorUserId: owner })
  })
})

describe('refusing an upload', () => {
  it('turns away someone who is not signed in', async () => {
    signedInAs = null
    const row = message()
    const holding = join(folder, files.INCOMING)
    const before = existsSync(holding) ? readdirSync(holding) : []
    expect(await send(Buffer.from('x'), { sermonId: row.id, filename: 'x.mp4' })).toEqual({ ok: false, status: 401 })
    expect(files.loadLocalFile(row.id)).toBeUndefined()
    // Not even a partial file is left on disk.
    expect(readdirSync(holding)).toEqual(before)
  })

  it('turns away a message that does not exist, and an empty file', async () => {
    signedInAs = account()
    expect(await send(Buffer.from('x'), { sermonId: 'no-such-message', filename: 'x.mp4' })).toEqual({ ok: false, status: 404 })
    expect(await send(Buffer.from('x'), { filename: 'x.mp4' })).toEqual({ ok: false, status: 404 })
    expect(await send(Buffer.alloc(0), { sermonId: message().id, filename: 'x.mp4' })).toMatchObject({ ok: false })
  })

  it('turns away a video the disk has no room for, before any of it is sent', async () => {
    signedInAs = account()
    const row = message()
    const huge = Readable.from([Buffer.from('tiny')])
    expect(await send(huge, { sermonId: row.id, filename: 'x.mp4' }, { chunkSize: 1024, uploadSize: 10 ** 15 })).toEqual({ ok: false, status: 507 })
    expect(files.loadLocalFile(row.id)).toBeUndefined()
  })

  it('does not let a file’s own name decide where it is stored', async () => {
    signedInAs = account()
    const row = message()
    await send(Buffer.from('sneaky'), { sermonId: row.id, filename: '../../../etc/evil.mp4' })
    const stored = files.loadLocalFile(row.id)!
    expect(stored.relativePath).toBe(`2026/${row.slug}-${row.id.slice(0, 8)}/original.mp4`)
    expect(existsSync(join(dir, 'etc'))).toBe(false)
  })
})

describe('the copy once it is kept', () => {
  it('shows the office its size and when it was stored, and nothing about where', async () => {
    signedInAs = account()
    const row = message()
    expect(lib.presentAdminSermon(lib.loadSermon({ id: row.id })!).localCopy).toBeNull()
    await send(Buffer.from('twelve bytes'), { sermonId: row.id, filename: 'x.mp4' })
    const view = lib.presentAdminSermon(lib.loadSermon({ id: row.id })!)
    expect(view.localCopy).toMatchObject({ size: 12 })
    expect(JSON.stringify(view)).not.toContain(folder)
    expect(JSON.stringify(view)).not.toContain('original.mp4')
  })

  it('can be removed, from disk and from the record, and a second removal does nothing', async () => {
    signedInAs = account()
    const row = message()
    await send(Buffer.from('remove me'), { sermonId: row.id, filename: 'x.mp4' })
    const path = join(folder, files.loadLocalFile(row.id)!.relativePath)
    expect(existsSync(path)).toBe(true)
    expect(files.removeLocalFile(folder, row.id)).toBe(true)
    expect(existsSync(path)).toBe(false)
    expect(files.loadLocalFile(row.id)).toBeUndefined()
    expect(files.removeLocalFile(folder, row.id)).toBe(false)
  })

  it('goes with the message when it is deleted', async () => {
    signedInAs = account()
    const row = message()
    await send(Buffer.from('cascade'), { sermonId: row.id, filename: 'x.mp4' })
    db.delete(schema.sermons).where(orm.eq(schema.sermons.id, row.id)).run()
    expect(files.loadLocalFile(row.id)).toBeUndefined()
  })
})

describe('upload pieces nobody finished', () => {
  const holding = () => join(folder, '.incoming')
  const leave = (name: string, daysOld: number) => {
    mkdirSync(holding(), { recursive: true })
    const path = join(holding(), name)
    writeFileSync(path, 'half a video')
    const when = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)
    utimesSync(path, when, when)
  }

  it('are cleared after two days, and a recent one is left alone', () => {
    leave('abandoned', 3)
    leave('abandoned.json', 3)
    leave('in-progress', 0.1)
    expect(files.sweepIncoming(folder)).toBe(2)
    expect(existsSync(join(holding(), 'abandoned'))).toBe(false)
    expect(existsSync(join(holding(), 'abandoned.json'))).toBe(false)
    expect(existsSync(join(holding(), 'in-progress'))).toBe(true)
  })

  it('do nothing where there is no holding folder yet', () => {
    expect(files.sweepIncoming(join(dir, 'never-used'))).toBe(0)
  })
})

describe('the upload server for a folder', () => {
  it('asks the latest caller who is signed in, not whoever called first', async () => {
    const other = join(dir, 'other-videos')
    // Each request builds its own sign-in check, as a route does, fixed to who that request names.
    const shared = createServer((req, res) => {
      const who = (req.headers['x-test-user'] as string | undefined) ?? null
      void files.uploadServer(other, () => who).handle(req, res)
    })
    await new Promise<void>(resolve => shared.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(shared.address() as { port: number }).port}${'/api/admin/local-upload'}`
    const start = (user: string | null) => fetch(url, {
      method: 'POST',
      headers: { 'tus-resumable': '1.0.0', 'upload-length': '1', 'upload-metadata': `sermonId ${Buffer.from(message().id).toString('base64')}`, ...(user ? { 'x-test-user': user } : {}) },
    }).then(response => response.status)
    // The first caller is signed out, so the server is made with a check that refuses everyone.
    expect(await start(null)).toBe(401)
    // The next caller is signed in; a server that kept the first check would still say 401.
    expect(await start(account())).toBe(201)
    await new Promise(resolve => shared.close(resolve))
  })
})
