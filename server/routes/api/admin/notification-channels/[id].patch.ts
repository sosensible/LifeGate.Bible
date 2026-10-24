// Rename, describe or retire a church-wide channel.
import { channelPatchSchema } from '../../../../../shared/notifications.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { updateChurchChannel } from '../../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { siteSettings: ['update'] })
  const id = getRouterParam(event, 'id') ?? ''
  const patch = await readValidatedBody(event, channelPatchSchema.parse)
  db.transaction((tx) => {
    const fields = updateChurchChannel(tx, id, patch)
    recordAudit(tx, { actorUserId: session.user.id, action: 'notification.channel', entityType: 'notificationChannel', entityId: id, fields })
  })
  return { ok: true }
})
