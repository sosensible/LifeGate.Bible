// Asks for a draft message to be published as soon as its hosted video is ready, or
// takes the request back. Needs the right to publish, like publishing by hand.
import { z } from 'zod'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { setPublishWhenReady } from '../../../../../../lib/hosted-video.ts'
import { presentAdminSermon } from '../../../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['publish'] })
  const id = getRouterParam(event, 'id')!
  const { on } = await readValidatedBody(event, z.object({ on: z.boolean() }).parse)

  const sermon = setPublishWhenReady(id, on ? session.user.id : null, tx =>
    recordAudit(tx, { actorUserId: session.user.id, action: 'sermon.hosted_video', entityType: 'sermon', entityId: id, note: on ? 'Asked to publish when the video is ready' : 'Withdrew the request to publish when the video is ready' }))
  return { sermon: presentAdminSermon(sermon) }
})
