// Add a church-wide channel.
import { channelInputSchema } from '../../../../shared/notifications.ts'
import { recordAudit } from '../../../lib/audit.ts'
import { db } from '../../../lib/db.ts'
import { createChurchChannel } from '../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { siteSettings: ['update'] })
  const input = await readValidatedBody(event, channelInputSchema.parse)
  const id = db.transaction((tx) => {
    const created = createChurchChannel(tx, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'notification.channel', entityType: 'notificationChannel', entityId: created, note: 'added' })
    return created
  })
  setResponseStatus(event, 201)
  return { id }
})
