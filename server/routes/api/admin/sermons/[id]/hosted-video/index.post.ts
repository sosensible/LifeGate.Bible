// Starts a hosted copy of a message's video and hands back a signed ticket, so the browser
// uploads the file straight to the video host and never sends it through this server.
import { bunnyConfig } from '../../../../../../lib/bunny.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { startHostedVideo } from '../../../../../../lib/hosted-video.ts'
import { loadSermon, presentAdminSermon } from '../../../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  const id = getRouterParam(event, 'id')!
  const config = bunnyConfig()
  if (!config) throw createError({ statusCode: 503, statusMessage: 'No video host is connected to this site yet.' })

  const ticket = await startHostedVideo(config, id, tx =>
    recordAudit(tx, { actorUserId: session.user.id, action: 'sermon.hosted_video', entityType: 'sermon', entityId: id, note: 'Started a hosted video' }))
  return { sermon: presentAdminSermon(loadSermon({ id })!), ticket }
})
