// One mission organization, by slug, with the missionaries serving with it.
import { loadMissionaries, loadOrganizations } from '../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsReader(event)
  const organization = loadOrganizations().find(o => o.slug === getRouterParam(event, 'ref'))
  if (!organization) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  return {
    organization,
    missionaries: loadMissionaries({ canEdit: viewer.canEdit, organizationId: organization.id }),
    canEdit: viewer.canEdit,
  }
})
