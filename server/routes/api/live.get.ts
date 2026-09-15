// Live meetings showing now, for the Teaching and home pages. Public: a
// members-only meeting's name and link are left out for anyone but members.
import { churchTimeZone, liveNowFor } from '../../lib/live.ts'
import type { LiveNowResponse } from '../../../shared/live.ts'

export default defineEventHandler(async (event): Promise<LiveNowResponse> => {
  const viewer = await getSermonViewer(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { timeZone: churchTimeZone(), meetings: liveNowFor({ mayJoinMembersOnly: viewer.isMember || viewer.canManage }) }
})
