// The signed-in person's own log. Takes no person: there is no way to ask for another's.
import { loadLog } from '../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireNotifyViewer(event)
  return loadLog(viewer)
})
