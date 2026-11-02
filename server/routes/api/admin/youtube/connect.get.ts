// Sends the person to Google to approve the site posting videos to their channel.
import { authUrl, signState, youtubeConfig } from '../../../../lib/youtube.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { integrations: ['manage'] })
  const config = youtubeConfig()
  if (!config) throw createError({ statusCode: 503, statusMessage: 'YouTube is not set up on this site yet. See the setup guide in Help.' })
  return sendRedirect(event, authUrl(config, signState(session.user.id)), 302)
})
