// One mission organization, by slug, with the missionaries serving with it.
import { loadMissionaries, loadOrganizations } from '../../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsReader(event)
  const organization = loadOrganizations({ slug: getRouterParam(event, 'ref') ?? '' })[0]
  if (!organization || (organization.archivedAt && !viewer.canDelete)) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  return {
    organization,
    missionaries: loadMissionaries({ canEdit: viewer.canEdit, canSeeArchived: viewer.canDelete, organizationId: organization.id }),
    canEdit: viewer.canEdit,
    canDelete: viewer.canDelete,
  }
})
