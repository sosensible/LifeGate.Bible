// A ministry's notification channels, for the people who serve in it. Leaders also
// see the retired ones and may manage them.
import { loadMinistryChannels, ministryIdOf } from '../../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireNotifyViewer(event)
  return loadMinistryChannels(viewer, ministryIdOf(getRouterParam(event, 'slug') ?? ''))
})
