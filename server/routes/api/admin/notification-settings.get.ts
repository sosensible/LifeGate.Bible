// The global message settings, with the accounts that could be chosen to announce.
import { loadNotificationSettingsView } from '../../../lib/notification-settings.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { siteSettings: ['update'] })
  return loadNotificationSettingsView()
})
