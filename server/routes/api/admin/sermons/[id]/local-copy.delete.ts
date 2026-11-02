// Removes the church server's copy of a message's video, from disk and from the record. The
// copy on the video host or YouTube is not touched.
import { refuseDuringMove } from '../../../../../lib/folder-move.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { removeLocalFile } from '../../../../../lib/local-files.ts'
import { localVideoFolder } from '../../../../../lib/local-video.ts'
import { loadSermon, presentAdminSermon } from '../../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['delete'] })
  refuseDuringMove()
  const id = getRouterParam(event, 'id')!
  if (!loadSermon({ id })) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  if (removeLocalFile(localVideoFolder(), id)) {
    recordAudit(db, { actorUserId: session.user.id, action: 'sermon.local_copy', entityType: 'sermon', entityId: id, note: 'Removed the copy of the video on the church server' })
  }
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
