// What the church-wide announcers have sent, with counts only. For those chosen to send.
import { loadSent } from '../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireNotifyViewer(event)
  return loadSent(viewer, { churchWide: true })
})
