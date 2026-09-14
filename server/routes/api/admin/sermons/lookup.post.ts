// Checks a YouTube link and returns the video's title, so the form can confirm
// the right video and prefill the title. Uses YouTube's public oEmbed endpoint,
// which needs no API key and works for unlisted videos.
import { videoLookupSchema } from '../../../../../shared/sermons.ts'
import { parseYouTubeId, youTubeWatchUrl } from '../../../../../shared/youtube.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { sermon: ['update'] })
  const { video } = await readValidatedBody(event, videoLookupSchema.parse)

  const videoId = parseYouTubeId(video)
  if (!videoId) throw createError({ statusCode: 400, statusMessage: 'That is not a YouTube video link' })

  const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youTubeWatchUrl(videoId))}`)
    .catch(() => null)

  if (!response) throw createError({ statusCode: 502, statusMessage: 'YouTube could not be reached. You can still save the link.' })
  if (response.status === 401 || response.status === 403) {
    throw createError({ statusCode: 422, statusMessage: 'That video is private or cannot be embedded. Set it to Unlisted or Public on YouTube and allow embedding.' })
  }
  if (!response.ok) throw createError({ statusCode: 404, statusMessage: 'No YouTube video was found at that link' })

  const { title, author_name: channel } = await response.json() as { title?: string, author_name?: string }
  return { videoId, title: title ?? null, channel: channel ?? null }
})
