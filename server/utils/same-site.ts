// Refuses a request for a photo unless it came from a page of this site. Answered
// as "not found", like every other photo refusal, so it confirms nothing.
// Auto-imported into every server route.
import type { H3Event } from 'h3'
import { isFromThisSite } from '../lib/photos.ts'

export const requireRequestFromThisSite = (event: H3Event) => {
  const ok = isFromThisSite({
    secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
    referer: getRequestHeader(event, 'referer'),
    host: getRequestHost(event, { xForwardedHost: true }),
  })
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Not found' })
}
