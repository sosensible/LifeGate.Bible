// Keeping a message only on the church video host: the church server's copy is removed, but only
// after the host has been shown to hold the very same original. If it does not, or cannot be
// asked, nothing is removed, because that copy would be the last.
import { createError } from 'h3'
import { BunnyError, getHostedVideoInfo, type BunnyConfig } from './bunny.ts'
import { recordAudit } from './audit.ts'
import { db } from './db.ts'
import { refuseDuringMove } from './folder-move.ts'
import { loadLocalFile, removeLocalFile } from './local-files.ts'
import { loadSermon } from './sermons.ts'

export const releaseLocalCopy = async (sermonId: string, deps: { config: BunnyConfig, folder: string, userId: string | null, doFetch?: typeof fetch }) => {
  refuseDuringMove()
  const { config, folder, userId, doFetch = fetch } = deps
  const sermon = loadSermon({ id: sermonId })
  if (!sermon) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  const local = loadLocalFile(sermonId)
  if (!local) throw createError({ statusCode: 409, statusMessage: 'This message has no copy on the church server.' })
  if (!sermon.hostedVideoId || sermon.hostedVideoState !== 'ready') {
    throw createError({ statusCode: 409, statusMessage: 'There is no finished copy on the video host, so the church server’s copy is the only one.' })
  }

  let info
  try {
    info = await getHostedVideoInfo(config, sermon.hostedVideoId, doFetch)
  }
  catch (error) {
    if (error instanceof BunnyError) throw createError({ statusCode: 502, statusMessage: `${error.message} Nothing was removed.` })
    throw error
  }
  if (!info.hasOriginal) {
    throw createError({ statusCode: 409, statusMessage: 'The video host does not hold the original (“Keep original files” was off), so the church server’s copy would be the last. Nothing was removed.' })
  }
  if (!info.originalHash || info.originalHash !== local.sha256) {
    throw createError({ statusCode: 409, statusMessage: 'The video host’s original is not the same file as the one stored here, or its checksum is not known. Nothing was removed.' })
  }

  removeLocalFile(folder, sermonId)
  recordAudit(db, { actorUserId: userId, action: 'sermon.local_copy', entityType: 'sermon', entityId: sermonId, note: 'Kept only on the video host (its original was checked to be the same file)' })
}
