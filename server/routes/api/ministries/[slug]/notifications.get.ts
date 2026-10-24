// What a ministry's leaders have sent, and how far it reached: counts only, never who.
import { loadSent, ministryIdOf } from '../../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireNotifyViewer(event)
  return loadSent(viewer, { ministryId: ministryIdOf(getRouterParam(event, 'slug') ?? '') })
})
