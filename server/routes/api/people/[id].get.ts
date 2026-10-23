// One person's member page, as the signed-in viewer may see it. Members only.
// Anything the viewer may not see, a minor included, is a 404, so the answer does
// not confirm that the person exists.
import { loadPersonPage } from '../../../lib/person-page.ts'

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)
  if (!viewer.session) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  if (!viewer.isMember && !viewer.isStaff) throw createError({ statusCode: 403, statusMessage: 'Not allowed' })

  const page = loadPersonPage(viewer, getRouterParam(event, 'id') ?? '')
  if (!page) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  return page
})
