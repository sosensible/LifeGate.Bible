// A short-lived link to play a message's hosted video, given only to someone who may watch
// the message. The link is asked for when the viewer presses play, so a message that is
// paused, withdrawn or limited stops handing out links at once.
import { bunnyConfig, embedUrl, PLAY_LINK_SECONDS } from '../../../../lib/bunny.ts'
import { refreshHostedVideo } from '../../../../lib/hosted-video.ts'
import { canViewSermon, isTeacherOf, loadSermon } from '../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  let sermon = loadSermon({ slug: getRouterParam(event, 'slug') ?? '' })
  const viewer = await getSermonViewer(event)
  const mayWatch = sermon && (canViewSermon(sermon, viewer) || isTeacherOf(sermon, viewer.session?.user.id))
  const config = bunnyConfig()
  if (!sermon || !mayWatch || !sermon.hostedVideoId || !config) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  if (sermon.hostedVideoState === 'processing') sermon = await refreshHostedVideo(config, sermon.id)
  if (sermon.hostedVideoState !== 'ready' || !sermon.hostedVideoId) throw createError({ statusCode: 409, statusMessage: 'This video is still getting ready.' })

  const expires = Math.floor(Date.now() / 1000) + PLAY_LINK_SECONDS
  setHeader(event, 'cache-control', 'no-store')
  return { url: embedUrl(config, sermon.hostedVideoId, expires), expires }
})
