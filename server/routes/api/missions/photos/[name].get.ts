// A missions photo, for signed-in members and missions editors only.
import { readPhoto } from '../../../../lib/uploads.ts'

export default defineEventHandler(async (event) => {
  await requireMissionsReader(event)
  const photo = readPhoto(getRouterParam(event, 'name') ?? '')
  if (!photo) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  setHeaders(event, {
    'content-type': photo.type,
    // Private: browsers may keep it, shared caches (Cloudflare) must not.
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
  })
  return photo.data
})
