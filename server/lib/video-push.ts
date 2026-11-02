// Sending the stored copy of a message's video on to the places it is shown from: the church
// video host and the church's YouTube channel, from this server.
//
// The file is already on the church server (server/lib/local-files.ts). A volunteer does not wait
// for either: the site sends it in the background, in resumable pieces, and tries again with
// growing gaps if the connection or the other end fails. The stored file is never played from here;
// it is only the master, and the source for sending elsewhere.
import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, mkdirSync, openAsBlob, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { and, eq, lt, lte, or } from 'drizzle-orm'
import { Upload } from 'tus-js-client'
import { MAX_PUSH_ATTEMPTS } from '../../shared/hosted-video.ts'
import { uploadToYouTube, type Put } from '../../shared/youtube-upload.ts'
import { sermonFiles, sermons, videoPushes } from '../database/schema/index.ts'
import { recordAudit } from './audit.ts'
import { bunnyConfig, createHostedVideo, deleteHostedVideo, getHostedVideoInfo, originalFileUrl, uploadTicket, UPLOAD_TICKET_SECONDS, type BunnyConfig } from './bunny.ts'
import { db } from './db.ts'
import { moveInProgress } from './folder-move.ts'
import { integrationValue } from './integration-secrets.ts'
import { absolutePath, INCOMING, loadLocalFile, storeUploaded } from './local-files.ts'
import { checkFolder, localVideoFolder } from './local-video.ts'
import { loadSermon } from './sermons.ts'
import { connectedAccess, siteOrigin, startUploadSession, videoIsOnChannel, youtubeConfig, type YouTubeConfig } from './youtube.ts'

type Fetch = typeof fetch
export type PushTarget = 'host' | 'youtube' | 'pull'
const MAX_ATTEMPTS = MAX_PUSH_ATTEMPTS
// A push that says it is sending but has not moved for this long is taken to have died with the server.
const STALE_SENDING_MS = 3 * 60 * 60 * 1000
// Pieces of the file sent to the host at a time.
const PIECE_BYTES = 50 * 1024 * 1024

// 1 minute, then 2, 4, 8 ... never more than an hour.
export const retryDelaySeconds = (attempts: number) => Math.min(60 * 2 ** Math.max(0, attempts - 1), 3600)

export const loadPush = (sermonId: string, target: PushTarget = 'host') =>
  db.select().from(videoPushes).where(and(eq(videoPushes.sermonId, sermonId), eq(videoPushes.target, target))).get()

// Asks for the stored file to be sent. Sending again is asked for whenever the file changes.
export const queuePush = (sermonId: string, sha256: string, now = new Date(), target: PushTarget = 'host') => {
  const values = { state: 'queued' as const, sha256, attempts: 0, lastError: null, nextAttemptAt: now, updatedAt: now }
  db.insert(videoPushes).values({ sermonId, target, ...values })
    .onConflictDoUpdate({ target: [videoPushes.sermonId, videoPushes.target], set: values }).run()
}

// What a person pressing "Send" does: start over, with the attempts count cleared.
export const retryPush = (sermonId: string, now = new Date(), target: PushTarget = 'host') => {
  const local = loadLocalFile(sermonId)
  if (!local) return false
  queuePush(sermonId, local.sha256, now, target)
  return true
}

// What to send on once a video is filed: to the video host whenever it is connected, and to YouTube
// only if the volunteer asked and the channel is connected.
export const queueSends = (sermonId: string, sha256: string, wishes: { youtube: boolean }, connected: { host: boolean, youtube: boolean }, now = new Date()) => {
  const queued: PushTarget[] = []
  if (connected.host) {
    queuePush(sermonId, sha256, now, 'host')
    queued.push('host')
  }
  if (wishes.youtube && connected.youtube) {
    queuePush(sermonId, sha256, now, 'youtube')
    queued.push('youtube')
  }
  return queued
}

// Sends every stored video again to one place, for instance after the church moves to a new video
// library or a new channel. Each message is queued afresh; the usual rules (one at a time, retries,
// replace only once the whole file has arrived) then apply.
export const resendAll = (target: 'host' | 'youtube', now = new Date()) => {
  const stored = db.select({ sermonId: sermonFiles.sermonId, sha256: sermonFiles.sha256 }).from(sermonFiles).all()
  for (const file of stored) queuePush(file.sermonId, file.sha256, now, target)
  return stored.length
}

// ---- To the church video host ---------------------------------------------------------

// Sends one file to the host, in resumable pieces, straight from disk.
export type HostUploader = (config: BunnyConfig, file: { path: string, size: number }, videoId: string, title: string, now: number, options?: { pieceBytes?: number, retryDelays?: number[] }) => Promise<void>

export const uploadFileToHost: HostUploader = (config, file, videoId, title, now, options = {}) => new Promise<void>((resolve, reject) => {
  const ticket = uploadTicket(config, videoId, Math.floor(now / 1000) + UPLOAD_TICKET_SECONDS)
  const upload = new Upload(createReadStream(file.path) as never, {
    endpoint: ticket.endpoint,
    uploadSize: file.size,
    chunkSize: options.pieceBytes ?? PIECE_BYTES,
    retryDelays: options.retryDelays ?? [0, 3000, 10000, 30000, 60000],
    headers: { AuthorizationSignature: ticket.signature, AuthorizationExpire: String(ticket.expires), VideoId: ticket.videoId, LibraryId: ticket.libraryId },
    metadata: { filetype: 'video/mp4', title },
    onError: reject,
    onSuccess: () => resolve(),
  })
  upload.start()
})

const note = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300)

export type PushResult = 'sent' | 'failed' | 'skipped'

interface Deps {
  folder: string
  doFetch?: Fetch
  now?: () => number
  // Test hooks: how a send is broken into pieces, and how long it waits between tries.
  pieceBytes?: number
  retryDelays?: number[]
  sleep?: (ms: number) => Promise<void>
}

// Marks a send as started, and what to do when it has gone one way or the other.
const begin = (sermonId: string, target: PushTarget, sha256: string, attempts: number, at: number) =>
  db.insert(videoPushes).values({ sermonId, target, state: 'sending', sha256, attempts, updatedAt: new Date(at) })
    .onConflictDoUpdate({ target: [videoPushes.sermonId, videoPushes.target], set: { state: 'sending', sha256, attempts, updatedAt: new Date(at) } }).run()

const fail = (sermonId: string, target: PushTarget, attempts: number, error: unknown, at: number) =>
  db.update(videoPushes).set({
    state: 'failed',
    lastError: note(error),
    nextAttemptAt: new Date(at + retryDelaySeconds(attempts) * 1000),
    updatedAt: new Date(at),
  }).where(and(eq(videoPushes.sermonId, sermonId), eq(videoPushes.target, target))).run()

const succeed = (tx: Pick<typeof db, 'update'>, sermonId: string, target: PushTarget, at: number) =>
  tx.update(videoPushes).set({ state: 'sent', lastError: null, updatedAt: new Date(at) })
    .where(and(eq(videoPushes.sermonId, sermonId), eq(videoPushes.target, target))).run()

// One send to the host. The new copy replaces the message's hosted copy only once the whole file
// has arrived, so a failed send never disturbs a video that works, and the half-made copy is removed.
export const pushToHost = async (sermonId: string, deps: Deps & { config: BunnyConfig, upload?: HostUploader }): Promise<PushResult> => {
  const { config, folder, upload = uploadFileToHost, doFetch = fetch, now = Date.now, pieceBytes, retryDelays } = deps
  const local = loadLocalFile(sermonId)
  const sermon = loadSermon({ id: sermonId })
  const push = loadPush(sermonId, 'host')
  if (!local || !sermon) return 'skipped'
  if (push?.state === 'sent' && push.sha256 === local.sha256) return 'skipped'

  const attempts = (push?.attempts ?? 0) + 1
  begin(sermonId, 'host', local.sha256, attempts, now())

  let videoId: string | null = null
  try {
    const path = absolutePath(folder, local.relativePath)
    if (statSync(path).size !== local.size) throw new Error('The stored file is not the size it was when it arrived.')
    videoId = await createHostedVideo(config, sermon.title, doFetch)
    await upload(config, { path, size: local.size }, videoId, sermon.title, now(), { pieceBytes, retryDelays })

    // The message may have been removed while this was sending.
    const current = loadSermon({ id: sermonId })
    if (!current) {
      await deleteHostedVideo(config, videoId, doFetch).catch(() => {})
      return 'skipped'
    }
    db.transaction((tx) => {
      tx.update(sermons).set({ hostedVideoId: videoId, hostedVideoState: 'processing' }).where(eq(sermons.id, sermonId)).run()
      succeed(tx, sermonId, 'host', now())
    })
    if (current.hostedVideoId) await deleteHostedVideo(config, current.hostedVideoId, doFetch).catch(() => {})
    return 'sent'
  }
  catch (error) {
    if (videoId) await deleteHostedVideo(config, videoId, doFetch).catch(() => {})
    fail(sermonId, 'host', attempts, error, now())
    return 'failed'
  }
}

// ---- To the church's YouTube channel --------------------------------------------------

// A request to YouTube's upload address from this server. A 308 is YouTube saying "send the
// rest", not a redirect, so it is not followed.
export const nodePut: Put = async (url, body, headers, _onSent, signal) => {
  const response = await fetch(url, { method: 'PUT', headers, body: body ?? undefined, signal, redirect: 'manual' })
  return { status: response.status, range: response.headers.get('range'), body: await response.text() }
}

const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo' }

// One send to YouTube, as unlisted, straight from disk. Afterwards the video is confirmed to be
// on the church's channel before the message is pointed at it. A message with a YouTube link
// already has it replaced; the earlier video stays on the channel, since the site may only upload.
export const pushToYouTube = async (sermonId: string, deps: Deps & { config: YouTubeConfig, put?: Put }): Promise<PushResult> => {
  const { config, folder, doFetch = fetch, now = Date.now, put = nodePut, retryDelays, sleep } = deps
  const local = loadLocalFile(sermonId)
  const sermon = loadSermon({ id: sermonId })
  const push = loadPush(sermonId, 'youtube')
  if (!local || !sermon) return 'skipped'
  if (push?.state === 'sent' && push.sha256 === local.sha256) return 'skipped'

  const attempts = (push?.attempts ?? 0) + 1
  begin(sermonId, 'youtube', local.sha256, attempts, now())

  try {
    const path = absolutePath(folder, local.relativePath)
    if (statSync(path).size !== local.size) throw new Error('The stored file is not the size it was when it arrived.')
    const access = await connectedAccess(config, doFetch)
    if (!access) throw new Error('The church’s YouTube channel is not connected.')
    const extension = /\.[a-z0-9]+$/i.exec(local.relativePath)?.[0]?.toLowerCase() ?? ''
    const sessionUrl = await startUploadSession(access.accessToken, { title: sermon.title, description: sermon.description, privacy: 'unlisted' }, { size: local.size, type: MIME[extension] ?? 'video/*' }, null, doFetch)
    const videoId = await uploadToYouTube(await openAsBlob(path), sessionUrl, { put, retryDelays, sleep })
    if (!await videoIsOnChannel(access.accessToken, videoId, access.channelId, doFetch)) throw new Error('YouTube accepted the video, but it is not on the church’s channel.')

    const current = loadSermon({ id: sermonId })
    if (!current) return 'skipped'
    db.transaction((tx) => {
      tx.update(sermons).set({ videoProvider: 'youtube', videoId }).where(eq(sermons.id, sermonId)).run()
      recordAudit(tx, { actorUserId: null, action: 'sermon.youtube', entityType: 'sermon', entityId: sermonId, note: 'Posted to the church’s YouTube channel from the church server' })
      // With no copy on the video host to wait for, a YouTube video is playable at once.
      if (current.publishWhenReadyBy && current.status === 'draft' && !current.hostedVideoId && !loadPush(sermonId, 'host')) {
        tx.update(sermons).set({ status: 'published', publishedAt: new Date(now()), publishWhenReadyBy: null }).where(eq(sermons.id, sermonId)).run()
        recordAudit(tx, { actorUserId: current.publishWhenReadyBy, action: 'sermon.publish', entityType: 'sermon', entityId: sermonId, note: 'Published automatically when its video was ready' })
      }
      succeed(tx, sermonId, 'youtube', now())
    })
    return 'sent'
  }
  catch (error) {
    fail(sermonId, 'youtube', attempts, error, now())
    return 'failed'
  }
}

// ---- Bringing a copy in from the video host ------------------------------------------

// Asks for the original to be brought in from the video host. There is no checksum to record yet.
export const queuePull = (sermonId: string, now = new Date()) => queuePush(sermonId, '', now, 'pull')

const EXTENSIONS: Record<string, string> = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-m4v': '.m4v', 'video/webm': '.webm', 'video/x-matroska': '.mkv', 'video/x-msvideo': '.avi' }

// One download of the original from the video host, into the church server's folder. The host
// is asked first whether it still holds the original (it does only if "Keep original files" was
// on when the video was uploaded) and what its checksum is, so a partial or different file is
// refused rather than kept as the master. The stored copy is then filed exactly like an upload.
export const pullFromHost = async (sermonId: string, deps: Deps & { config: BunnyConfig, cdnHost: string, origin?: string }): Promise<PushResult> => {
  const { config, cdnHost, folder, doFetch = fetch, now = Date.now, origin = siteOrigin() } = deps
  const sermon = loadSermon({ id: sermonId })
  const push = loadPush(sermonId, 'pull')
  if (!sermon?.hostedVideoId) return 'skipped'
  // Nothing is brought in while the stored videos are being moved.
  if (moveInProgress()) return 'skipped'
  if (loadLocalFile(sermonId)) {
    if (push) succeed(db, sermonId, 'pull', now())
    return 'skipped'
  }

  const attempts = (push?.attempts ?? 0) + 1
  begin(sermonId, 'pull', '', attempts, now())

  let temporary: string | null = null
  try {
    const info = await getHostedVideoInfo(config, sermon.hostedVideoId, doFetch)
    if (!info.hasOriginal) {
      throw new Error('The video host does not hold the original. “Keep original files” was off when this video was uploaded, so it cannot be brought back.')
    }
    const response = await doFetch(originalFileUrl(config, cdnHost, sermon.hostedVideoId, Math.floor(now() / 1000) + 3600), origin ? { headers: { referer: `${origin}/` } } : undefined)
    if (!response.ok || !response.body) throw new Error(`The video host would not give the file (${response.status}).`)
    const expected = Number(response.headers.get('content-length')) || null
    const free = checkFolder(folder).freeBytes
    if (expected && free !== null && free < expected * 1.1) throw new Error('The church server does not have room for this video.')

    mkdirSync(join(folder, INCOMING), { recursive: true })
    temporary = join(folder, INCOMING, `pull-${randomUUID()}`)
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporary))
    if (expected && statSync(temporary).size !== expected) throw new Error('The download stopped before the whole file arrived.')

    const extension = EXTENSIONS[(response.headers.get('content-type') ?? '').split(';')[0]!.trim()] ?? '.mp4'
    const stored = await storeUploaded({ folder, incomingPath: temporary, sermonId, originalName: `${sermon.slug}${extension}`, userId: null, expectedSha256: info.originalHash })
    temporary = null
    succeed(db, sermonId, 'pull', now())
    return stored ? 'sent' : 'skipped'
  }
  catch (error) {
    if (temporary) rmSync(temporary, { force: true })
    fail(sermonId, 'pull', attempts, error, now())
    return 'failed'
  }
}

// ---- The worker -----------------------------------------------------------------------

// One at a time: the box's connection is the limit, and two big sends only slow each other.
let working = false

type RunDeps = Deps & { config: BunnyConfig | null, youtube?: YouTubeConfig | null, cdnHost?: string | null, upload?: HostUploader, put?: Put }

// Sends whatever is waiting or due for another try. Safe to call often. A place that is not
// connected is left waiting.
export const runPushes = async (deps: RunDeps) => {
  if (working) return { sent: 0, failed: 0, busy: true }
  working = true
  const now = deps.now ?? Date.now
  try {
    const at = new Date(now())
    const stale = new Date(now() - STALE_SENDING_MS)
    const due = db.select({ sermonId: videoPushes.sermonId, target: videoPushes.target }).from(videoPushes).where(and(
      lte(videoPushes.nextAttemptAt, at),
      or(
        eq(videoPushes.state, 'queued'),
        and(eq(videoPushes.state, 'failed'), lt(videoPushes.attempts, MAX_ATTEMPTS)),
        and(eq(videoPushes.state, 'sending'), lte(videoPushes.updatedAt, stale)),
      ),
    )).all()
    let sent = 0
    let failed = 0
    for (const { sermonId, target } of due) {
      const result: PushResult = target === 'host'
        ? (deps.config ? await pushToHost(sermonId, { ...deps, config: deps.config }) : 'skipped')
        : target === 'youtube'
          ? (deps.youtube ? await pushToYouTube(sermonId, { ...deps, config: deps.youtube }) : 'skipped')
          : (deps.config && deps.cdnHost ? await pullFromHost(sermonId, { ...deps, config: deps.config, cdnHost: deps.cdnHost }) : 'skipped')
      if (result === 'sent') sent += 1
      if (result === 'failed') failed += 1
    }
    return { sent, failed, busy: false }
  }
  finally {
    working = false
  }
}

// Starts sending in the background, without making anyone wait. Does nothing unless a folder is
// chosen and at least one place is connected.
export const kickPushes = () => {
  const folder = localVideoFolder()
  const config = bunnyConfig()
  const youtube = youtubeConfig()
  const cdnHost = integrationValue('bunny.cdnHost')
  if (!folder || (!config && !youtube)) return
  void runPushes({ config, youtube, cdnHost, folder }).catch(error => console.error('[video-push] could not send', error))
}
