// One missionary, by slug, with their prayer requests and letters.
import { loadMissionaries } from '../../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsReader(event)
  const missionary = loadMissionaries({ canEdit: viewer.canEdit, slug: getRouterParam(event, 'ref') ?? '' })[0]
  if (!missionary) throw createError({ statusCode: 404, statusMessage: 'Missionary not found' })
  return { missionary, canEdit: viewer.canEdit }
})
