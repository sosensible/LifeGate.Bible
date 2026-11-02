// The church's own copy of a message's video, kept in the folder chosen on Church details.
//
// The volunteer uploads the file once, to this server, in resumable pieces (tus, so a dropped
// connection carries on where it left off, and each piece stays under Cloudflare's per-request
// limit). It lands in a holding folder, is checksummed, then moved to its permanent place:
//
//   <chosen folder>/<year>/<message slug>-<short id>/original.<ext>
//
// The database keeps the path RELATIVE to the chosen folder, with the checksum, so the folder
// can be moved later without losing track of anything.
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { FileStore } from '@tus/file-store'
import { Server } from '@tus/server'
import { eq } from 'drizzle-orm'
import { sermonFiles } from '../database/schema/index.ts'
import { recordAudit } from './audit.ts'
import { db } from './db.ts'
import { checkFolder } from './local-video.ts'
import { loadSermon } from './sermons.ts'

export const UPLOAD_PATH = '/api/admin/local-upload'
export const INCOMING = '.incoming'
// Who is making this request: the signed-in person's id, or null. In the site it reads the
// session cookie (see the route); a test passes its own.
export type WhoIs = (req: Request) => Promise<string | null> | string | null

// ".mp4" from "Sunday Service.MP4"; nothing if there is no sensible extension.
export const fileExtension = (name: string) => {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name.trim())
  return match ? `.${match[1]!.toLowerCase()}` : ''
}

export const relativePathFor = (sermon: { id: string, slug: string, preachedOn: string }, extension: string) =>
  `${sermon.preachedOn.slice(0, 4)}/${sermon.slug}-${sermon.id.slice(0, 8)}/original${extension}`

// A stored path turned into a real one, refusing anything that would land outside the folder.
export const absolutePath = (folder: string, relativePath: string) => {
  const root = resolve(folder)
  const full = resolve(root, relativePath)
  if (!full.startsWith(root + sep)) throw new Error('That path is outside the video folder')
  return full
}

export const sha256File = (path: string) => new Promise<string>((resolveHash, reject) => {
  const hash = createHash('sha256')
  createReadStream(path).on('data', chunk => hash.update(chunk)).on('error', reject).on('end', () => resolveHash(hash.digest('hex')))
})

export const loadLocalFile = (sermonId: string) => db.select().from(sermonFiles).where(eq(sermonFiles.sermonId, sermonId)).get()

// Moves a finished upload to its permanent place and records it. A second upload for the same
// message replaces the first, and the old file is removed.
// When the sender says what the checksum should be, a file that does not match is refused and removed.
export const storeUploaded = async (options: { folder: string, incomingPath: string, sermonId: string, originalName: string, userId: string | null, expectedSha256?: string | null }) => {
  const sermon = loadSermon({ id: options.sermonId })
  if (!sermon) throw new Error('Message not found')
  const relativePath = relativePathFor(sermon, fileExtension(options.originalName))
  const target = absolutePath(options.folder, relativePath)

  const sha256 = await sha256File(options.incomingPath)
  if (options.expectedSha256 && options.expectedSha256.toLowerCase() !== sha256) {
    rmSync(options.incomingPath, { force: true })
    throw new Error('The file that arrived is not the one the video host holds (the checksums differ).')
  }
  mkdirSync(join(target, '..'), { recursive: true })
  const previous = loadLocalFile(options.sermonId)
  renameSync(options.incomingPath, target)
  const size = statSync(target).size

  db.transaction((tx) => {
    tx.delete(sermonFiles).where(eq(sermonFiles.sermonId, options.sermonId)).run()
    tx.insert(sermonFiles).values({ sermonId: options.sermonId, relativePath, fileName: options.originalName.slice(0, 200), size, sha256, storedBy: options.userId }).run()
    recordAudit(tx, { actorUserId: options.userId, action: 'sermon.local_copy', entityType: 'sermon', entityId: options.sermonId, note: 'Stored a copy of the video on the church server' })
  })
  // The earlier copy, if it lived at a different path (a different extension).
  if (previous && previous.relativePath !== relativePath) rmSync(absolutePath(options.folder, previous.relativePath), { force: true })
  return { relativePath, size, sha256 }
}

// Removes the local copy: the file, and the record.
export const removeLocalFile = (folder: string | null, sermonId: string) => {
  const file = loadLocalFile(sermonId)
  if (!file) return false
  db.delete(sermonFiles).where(eq(sermonFiles.sermonId, sermonId)).run()
  if (folder) rmSync(absolutePath(folder, file.relativePath), { force: true })
  return true
}

// What the office sees of it.
export const presentLocalCopy = (file: { size: number, storedAt: Date } | undefined) =>
  file ? { size: file.size, storedAt: file.storedAt.toISOString() } : null

// ---- Receiving the upload -----------------------------------------------------------

const refuse = (status_code: number, body: string) => ({ status_code, body })

type AfterStored = (sermonId: string, sha256: string, wishes: { youtube: boolean }) => void
interface Hooks { whoIs: WhoIs, afterStored?: AfterStored }

// One upload server per folder, since the folder can be changed while the site runs. The server
// outlives the request that made it, so it reads the hooks from here, where each call leaves the
// latest ones, rather than holding on to the first caller's.
const servers = new Map<string, { server: Server, hooks: Hooks }>()

// `afterStored` runs once a video is filed, for whatever should follow (sending it on).
export const uploadServer = (folder: string, whoIs: WhoIs, afterStored?: AfterStored) => {
  const existing = servers.get(folder)
  if (existing) {
    existing.hooks = { whoIs, afterStored }
    return existing.server
  }
  const entry = { server: undefined as unknown as Server, hooks: { whoIs, afterStored } as Hooks }
  const holding = join(folder, INCOMING)
  mkdirSync(holding, { recursive: true })

  entry.server = new Server({
    path: UPLOAD_PATH,
    datastore: new FileStore({ directory: holding }),
    relativeLocation: true,
    // Same-site only: this takes a signed-in person's cookie, so no other site may call it.
    allowedOrigins: [],
    onUploadCreate: async (req, upload) => {
      if (!await entry.hooks.whoIs(req)) throw refuse(401, 'Sign in to upload.')
      const sermonId = upload.metadata?.sermonId
      if (!sermonId || !loadSermon({ id: sermonId })) throw refuse(404, 'That message was not found.')
      const size = upload.size
      if (!size || size < 1) throw refuse(400, 'That file is empty.')
      const free = checkFolder(folder).freeBytes
      if (free !== null && free < size * 1.1) throw refuse(507, 'The church server does not have room for this video.')
      return { metadata: upload.metadata }
    },
    onUploadFinish: async (req, upload) => {
      const userId = await entry.hooks.whoIs(req)
      const sermonId = upload.metadata?.sermonId
      if (!userId || !sermonId) throw refuse(401, 'Sign in to upload.')
      const incomingPath = join(holding, upload.id)
      try {
        const stored = await storeUploaded({ folder, incomingPath, sermonId, originalName: upload.metadata?.filename ?? 'video', userId })
        entry.hooks.afterStored?.(sermonId, stored.sha256, { youtube: upload.metadata?.postToYouTube === 'true' })
      }
      catch (error) {
        console.error('[local-files] could not store an upload', error)
        throw refuse(500, 'The video arrived but could not be saved.')
      }
      rmSync(`${incomingPath}.json`, { force: true })
      return {}
    },
  })
  servers.set(folder, entry)
  return entry.server
}

// Pieces of uploads nobody finished (a volunteer gave up, a phone went to sleep) stay in the
// holding folder, and the room check counts them. Anything not touched for two days is cleared;
// a live upload or download touches its file with every piece, so it is never in the way.
export const INCOMING_KEEP_MS = 2 * 24 * 60 * 60 * 1000
export const sweepIncoming = (folder: string, now = Date.now()) => {
  const holding = join(folder, INCOMING)
  if (!existsSync(holding)) return 0
  let removed = 0
  for (const entry of readdirSync(holding, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(holding, entry.name)
    if (now - statSync(path).mtimeMs < INCOMING_KEEP_MS) continue
    rmSync(path, { force: true })
    removed += 1
  }
  return removed
}
