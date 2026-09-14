// A sermon's video thumbnail, served from our own origin.
//
// Two reasons not to link i.ytimg.com directly: the thumbnail URL contains the
// video id, which must not reach people who may not watch a members-only
// sermon; and visitors' browsers make no request to Google until they press play.
import { canViewSermon, loadSermon } from '../../../../lib/sermons.ts'

const fetchThumbnail = defineCachedFunction(async (videoId: string) => {
  const response = await fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)
  if (!response.ok) return null
  return Buffer.from(await response.arrayBuffer()).toString('base64')
}, {
  name: 'youtube-thumbnail',
  maxAge: 60 * 60 * 24,
  getKey: (videoId: string) => videoId,
})

export default defineEventHandler(async (event) => {
  const sermon = loadSermon({ slug: getRouterParam(event, 'slug') ?? '' })
  const viewer = await getSermonViewer(event)
  if (!sermon?.videoId || sermon.videoProvider !== 'youtube' || !canViewSermon(sermon, viewer)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const image = await fetchThumbnail(sermon.videoId)
  if (!image) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const isPublic = sermon.status === 'published' && sermon.visibility === 'public'
  setHeaders(event, {
    'content-type': 'image/jpeg',
    'cache-control': `${isPublic ? 'public' : 'private'}, max-age=86400`,
    'x-content-type-options': 'nosniff',
  })
  return Buffer.from(image, 'base64')
})
