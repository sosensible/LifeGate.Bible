// Removes a message's hosted copy, from the message and from the video host.
// A YouTube link on the same message is left alone.
import { bunnyConfig } from '../../../../../../lib/bunny.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { removeHostedVideo } from '../../../../../../lib/hosted-video.ts'
import { loadSermon, presentAdminSermon } from '../../../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  const id = getRouterParam(event, 'id')!
  await removeHostedVideo(bunnyConfig(), id, tx =>
    recordAudit(tx, { actorUserId: session.user.id, action: 'sermon.hosted_video', entityType: 'sermon', entityId: id, note: 'Removed the hosted video' }))
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
