// Sends the stored copy of a message's video to the church's YouTube channel now, starting over if
// an earlier try failed. Needs a stored copy, and the channel connected.
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadLocalFile } from '../../../../../lib/local-files.ts'
import { loadSermon, presentAdminSermon } from '../../../../../lib/sermons.ts'
import { kickPushes, retryPush } from '../../../../../lib/video-push.ts'
import { youtubeConfig, youtubeStatus } from '../../../../../lib/youtube.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  const id = getRouterParam(event, 'id')!
  if (!loadSermon({ id })) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  if (!youtubeConfig() || !youtubeStatus().connected) throw createError({ statusCode: 503, statusMessage: 'The church’s YouTube channel is not connected yet.' })
  if (!loadLocalFile(id)) throw createError({ statusCode: 409, statusMessage: 'This message has no copy on the church server to send.' })

  retryPush(id, new Date(), 'youtube')
  recordAudit(db, { actorUserId: session.user.id, action: 'sermon.youtube', entityType: 'sermon', entityId: id, note: 'Asked to send the stored video to YouTube' })
  kickPushes()
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
