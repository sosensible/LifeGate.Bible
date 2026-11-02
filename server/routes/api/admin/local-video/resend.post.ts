// Sends every stored video again to the church video host or to YouTube, for example after
// connecting a new video library. Replaced copies are removed only once the new ones have arrived.
import { z } from 'zod'
import { recordAudit } from '../../../../lib/audit.ts'
import { bunnyConfig } from '../../../../lib/bunny.ts'
import { db } from '../../../../lib/db.ts'
import { kickPushes, resendAll } from '../../../../lib/video-push.ts'
import { youtubeConfig, youtubeStatus } from '../../../../lib/youtube.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { integrations: ['manage'] })
  const { target } = await readValidatedBody(event, z.object({ target: z.enum(['host', 'youtube']) }).parse)
  if (target === 'host' && !bunnyConfig()) throw createError({ statusCode: 503, statusMessage: 'No video host is connected to this site yet.' })
  if (target === 'youtube' && (!youtubeConfig() || !youtubeStatus().connected)) throw createError({ statusCode: 503, statusMessage: 'The church’s YouTube channel is not connected yet.' })

  const queued = resendAll(target)
  recordAudit(db, { actorUserId: session.user.id, action: 'sermon.hosted_video', entityType: 'site', entityId: null, note: `Asked to send all ${queued} stored videos again to ${target === 'host' ? 'the video host' : 'YouTube'}` })
  kickPushes()
  return { queued }
})
