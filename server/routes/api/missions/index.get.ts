// The Missions page: every missionary and organization. Members only.
import { loadMissionaries, loadOrganizations } from '../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsReader(event)
  return {
    // Updates are loaded on each missionary's own page.
    missionaries: loadMissionaries({ canEdit: viewer.canEdit }),
    organizations: loadOrganizations(),
    canEdit: viewer.canEdit,
  }
})
