// Who is asking to watch a shared broadcast (server/lib/broadcasts.ts): a signed-in member, a guest
// whose browser holds a valid code, or nobody yet. Auto-imported into the broadcast routes.
import type { H3Event } from 'h3'
import type { Broadcast, Who } from '../lib/broadcasts.ts'
import { passFromCookie } from '../lib/broadcasts.ts'

export const watchCookieName = (broadcast: Broadcast) => `lg_watch_${broadcast.id.replaceAll('-', '').slice(0, 16)}`

export const getBroadcastViewer = async (event: H3Event, broadcast: Broadcast): Promise<Who> => {
  const viewer = await getSermonViewer(event)
  if (viewer.session && viewer.isMember) return { kind: 'member', userId: viewer.session.user.id }
  const passId = passFromCookie(broadcast, getCookie(event, watchCookieName(broadcast)))
  if (passId) return { kind: 'pass', passId }
  return { kind: 'none', signedIn: Boolean(viewer.session) }
}
