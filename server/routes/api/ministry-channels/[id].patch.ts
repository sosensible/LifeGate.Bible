// A ministry's leaders rename a channel, change its description, or retire it.
import { channelPatchSchema } from '../../../../shared/notifications.ts'
import { recordAudit } from '../../../lib/audit.ts'
import { db } from '../../../lib/db.ts'
import { updateChannel } from '../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireNotifyViewer(event)
  const id = getRouterParam(event, 'id') ?? ''
  const patch = await readValidatedBody(event, channelPatchSchema.parse)

  db.transaction((tx) => {
    const fields = updateChannel(tx, viewer, id, patch)
    recordAudit(tx, { actorUserId: session.user.id, action: 'notification.channel', entityType: 'notificationChannel', entityId: id, fields })
  })
  return { ok: true }
})
