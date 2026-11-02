// Sends the stored copy of a message's video on to the church video host now, starting over if an
// earlier try failed. Needs a stored copy, and a video host that is connected.
import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { bunnyConfig } from '../../../../../../lib/bunny.ts'
import { loadLocalFile } from '../../../../../../lib/local-files.ts'
import { loadSermon, presentAdminSermon } from '../../../../../../lib/sermons.ts'
import { kickPushes, retryPush } from '../../../../../../lib/video-push.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  const id = getRouterParam(event, 'id')!
  if (!loadSermon({ id })) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  if (!bunnyConfig()) throw createError({ statusCode: 503, statusMessage: 'No video host is connected to this site yet.' })
  if (!loadLocalFile(id)) throw createError({ statusCode: 409, statusMessage: 'This message has no copy on the church server to send.' })

  retryPush(id)
  recordAudit(db, { actorUserId: session.user.id, action: 'sermon.hosted_video', entityType: 'sermon', entityId: id, note: 'Asked to send the stored video to the video host' })
  kickPushes()
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
