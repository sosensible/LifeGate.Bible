// The church-wide channels, retired ones included.
import { loadChurchChannels } from '../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { siteSettings: ['update'] })
  return { channels: loadChurchChannels() }
})
