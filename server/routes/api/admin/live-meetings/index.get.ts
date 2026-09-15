import { churchTimeZone, loadAdminLiveMeetings } from '../../../../lib/live.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { liveMeeting: ['manage'] })
  return { timeZone: churchTimeZone(), meetings: loadAdminLiveMeetings() }
})
