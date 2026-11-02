// Where Google sends the person back. Keeps the channel and a lasting (encrypted) key to it,
// then returns to Church details.
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { exchangeCode, fetchChannel, saveConnection, verifyState, YouTubeError, youtubeConfig } from '../../../../lib/youtube.ts'

const back = (event: Parameters<typeof sendRedirect>[0], result: 'connected' | 'error', message?: string) =>
  sendRedirect(event, `/admin/site?${new URLSearchParams({ youtube: result, ...(message ? { message } : {}) })}`, 302)

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { integrations: ['manage'] })
  const query = getQuery(event)
  const config = youtubeConfig()
  if (!config) return back(event, 'error', 'YouTube is not set up on this site yet.')
  if (query.error) return back(event, 'error', 'Google did not give access. Nothing was connected.')

  // The person coming back must be the one who left, within ten minutes.
  if (typeof query.state !== 'string' || verifyState(query.state) !== session.user.id || typeof query.code !== 'string') {
    return back(event, 'error', 'That sign-in link expired or was not started here. Try connecting again.')
  }

  try {
    const { accessToken, refreshToken } = await exchangeCode(config, query.code)
    const channel = await fetchChannel(accessToken)
    db.transaction((tx) => {
      saveConnection(channel, refreshToken, session.user.id)
      recordAudit(tx, { actorUserId: session.user.id, action: 'youtube.connect', entityType: 'youtube', entityId: channel.id, note: `Connected ${channel.title}` })
    })
    return back(event, 'connected')
  }
  catch (error) {
    return back(event, 'error', error instanceof YouTubeError ? error.message : 'The channel could not be connected.')
  }
})
