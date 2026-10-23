// A person's or household's photo, for the people who may see it. Whether that is
// this viewer is decided by the directory's own privacy rules (server/lib/photos.ts),
// so an address alone never reveals a photo the page would not show. Only a page of
// this site may ask: another site cannot embed a photo, and a link pasted elsewhere
// shows nothing. Anything not allowed is a 404, so the answer does not confirm the
// file exists.
import { canViewPhoto } from '../../../lib/photos.ts'
import { readPhoto } from '../../../lib/uploads.ts'

export default defineEventHandler(async (event) => {
  requireRequestFromThisSite(event)
  const viewer = await getViewer(event)
  if (!viewer.session) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })

  const name = getRouterParam(event, 'name') ?? ''
  const mayManage = viewer.isStaff && await hasPermission(viewer.session.user.id, { people: ['update'] })
  const photo = viewer.isMember || viewer.isStaff ? readPhoto(name) : null
  if (!photo || !canViewPhoto(viewer, mayManage, name)) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  setHeaders(event, {
    'content-type': photo.type,
    // Private: a browser may keep it, a shared cache (Cloudflare) must not.
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    // The browser itself refuses to show it on any other site.
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': "default-src 'none'",
  })
  return photo.data
})
