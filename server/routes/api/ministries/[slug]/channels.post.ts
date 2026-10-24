// A ministry's leaders add a channel.
import { channelInputSchema } from '../../../../../shared/notifications.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { createChannel, ministryIdOf } from '../../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireNotifyViewer(event)
  const ministryId = ministryIdOf(getRouterParam(event, 'slug') ?? '')
  const input = await readValidatedBody(event, channelInputSchema.parse)

  const id = db.transaction((tx) => {
    const created = createChannel(tx, viewer, ministryId, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'notification.channel', entityType: 'notificationChannel', entityId: created, note: 'added' })
    return created
  })
  setResponseStatus(event, 201)
  return { id }
})
