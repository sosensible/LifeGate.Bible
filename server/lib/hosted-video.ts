// Keeping a message's hosted video copy in step with the video host (server/lib/bunny.ts).
// The host holds the file; the message keeps only its id and whether it is ready.
import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { sermons } from '../database/schema/index.ts'
import { recordAudit, type Tx } from './audit.ts'
import { db } from './db.ts'
import {
  BunnyError, createHostedVideo, deleteHostedVideo, hostedVideoState, uploadTicket, UPLOAD_TICKET_SECONDS,
  type BunnyConfig,
} from './bunny.ts'
import { loadSermon } from './sermons.ts'

type Fetch = typeof fetch

const requireSermon = (id: string) => {
  const sermon = loadSermon({ id })
  if (!sermon) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  return sermon
}

const hostFailure = (error: unknown) => {
  if (error instanceof BunnyError) return createError({ statusCode: 502, statusMessage: error.message })
  throw error
}

// Starts a new hosted copy: makes the video on the host, remembers it, and returns what the
// browser needs to upload the file straight there. An earlier copy is removed once the
// new one is recorded, so a failed start never loses a video that works.
export const startHostedVideo = async (config: BunnyConfig, sermonId: string, audit: (tx: Tx) => void = () => {}, now = Date.now(), doFetch: Fetch = fetch) => {
  const sermon = requireSermon(sermonId)
  let videoId: string
  try {
    videoId = await createHostedVideo(config, sermon.title, doFetch)
  }
  catch (error) {
    throw hostFailure(error)
  }
  db.transaction((tx) => {
    tx.update(sermons).set({ hostedVideoId: videoId, hostedVideoState: 'processing' }).where(eq(sermons.id, sermonId)).run()
    audit(tx)
  })
  if (sermon.hostedVideoId) await deleteHostedVideo(config, sermon.hostedVideoId, doFetch).catch(() => {})
  const expires = Math.floor(now / 1000) + UPLOAD_TICKET_SECONDS
  return uploadTicket(config, videoId, expires)
}

// Takes the hosted copy off the message and off the host. Deleted on the host first, so a
// copy the host could not remove is still on the message to try again.
export const removeHostedVideo = async (config: BunnyConfig | null, sermonId: string, audit: (tx: Tx) => void = () => {}, doFetch: Fetch = fetch) => {
  const sermon = requireSermon(sermonId)
  if (!sermon.hostedVideoId) return false
  if (config) {
    try {
      await deleteHostedVideo(config, sermon.hostedVideoId, doFetch)
    }
    catch (error) {
      throw hostFailure(error)
    }
  }
  db.transaction((tx) => {
    tx.update(sermons).set({ hostedVideoId: null, hostedVideoState: null, publishWhenReadyBy: null }).where(eq(sermons.id, sermonId)).run()
    audit(tx)
  })
  return true
}

// Asks the host whether a copy that was still processing is ready, and records the answer.
// A copy already ready or failed is not asked again. When it turns ready for a message
// someone asked to publish as soon as that happened, the message is published, once.
export const refreshHostedVideo = async (config: BunnyConfig, sermonId: string, doFetch: Fetch = fetch) => {
  const sermon = requireSermon(sermonId)
  if (!sermon.hostedVideoId || sermon.hostedVideoState !== 'processing') return sermon
  let state
  try {
    state = await hostedVideoState(config, sermon.hostedVideoId, doFetch)
  }
  catch (error) {
    throw hostFailure(error)
  }
  if (state !== sermon.hostedVideoState) {
    db.transaction((tx) => {
      tx.update(sermons).set({ hostedVideoState: state }).where(eq(sermons.id, sermonId)).run()
      if (state === 'ready' && sermon.publishWhenReadyBy) {
        if (sermon.status === 'draft') {
          tx.update(sermons).set({ status: 'published', publishedAt: new Date() }).where(eq(sermons.id, sermonId)).run()
          recordAudit(tx, { actorUserId: sermon.publishWhenReadyBy, action: 'sermon.publish', entityType: 'sermon', entityId: sermonId, note: 'Published automatically when its video was ready' })
        }
        tx.update(sermons).set({ publishWhenReadyBy: null }).where(eq(sermons.id, sermonId)).run()
      }
    })
  }
  return requireSermon(sermonId)
}

// Asks for a message to be published as soon as its hosted video is ready, or withdraws
// that. Only for a draft with a hosted copy that is on its way; the caller has checked the
// person may publish.
export const setPublishWhenReady = (sermonId: string, userId: string | null, audit: (tx: Tx) => void = () => {}) => {
  const sermon = requireSermon(sermonId)
  if (userId) {
    if (!sermon.hostedVideoId || sermon.hostedVideoState === 'failed') {
      throw createError({ statusCode: 409, statusMessage: 'Upload a video first.' })
    }
    if (sermon.status === 'published') throw createError({ statusCode: 409, statusMessage: 'This message is already published.' })
  }
  db.transaction((tx) => {
    tx.update(sermons).set({ publishWhenReadyBy: userId }).where(eq(sermons.id, sermonId)).run()
    audit(tx)
  })
  return requireSermon(sermonId)
}

// The scheduled check: asks the host about every copy still processing, so messages
// finish getting ready, and publish if asked to, even when nobody has the editor open.
export const refreshProcessingVideos = async (config: BunnyConfig, doFetch: Fetch = fetch) => {
  const waiting = db.select({ id: sermons.id }).from(sermons).where(eq(sermons.hostedVideoState, 'processing')).all()
  let changed = 0
  for (const { id } of waiting) {
    try {
      const after = await refreshHostedVideo(config, id, doFetch)
      if (after.hostedVideoState !== 'processing') changed += 1
    }
    catch (error) {
      console.warn('[hosted-video] could not check', id, error)
    }
  }
  return { checked: waiting.length, changed }
}
