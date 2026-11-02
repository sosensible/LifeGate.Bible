// The shared broadcasts, with their seats and guest codes (never the codes themselves).
import { listBroadcasts } from '../../../../lib/broadcasts.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { liveMeeting: ['manage'] })
  setHeader(event, 'cache-control', 'no-store')
  return { broadcasts: listBroadcasts() }
})
