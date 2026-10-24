// Every channel the signed-in person could receive, and whether they follow it.
import { loadMyChannels } from '../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireNotifyViewer(event)
  return { channels: loadMyChannels(viewer) }
})
