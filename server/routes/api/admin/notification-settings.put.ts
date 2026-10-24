// Change the global message settings. Whoever may edit Church details may.
import { notificationSettingsSchema } from '../../../../shared/notifications.ts'
import { recordAudit } from '../../../lib/audit.ts'
import { db } from '../../../lib/db.ts'
import { loadNotificationSettingsView, updateNotificationSettings } from '../../../lib/notification-settings.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { siteSettings: ['update'] })
  const input = await readValidatedBody(event, notificationSettingsSchema.parse)

  db.transaction((tx) => {
    const fields = updateNotificationSettings(tx, input)
    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'notification.settings', entityType: 'site', entityId: 'site', fields })
  })
  return loadNotificationSettingsView()
})
