// The Missions page: every missionary and organization. Members only.
// Staff and admins also receive the archive.
import { loadMissionaries, loadOrganizations } from '../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsReader(event)
  return {
    // Updates are loaded on each missionary's own page.
    missionaries: loadMissionaries({ canEdit: viewer.canEdit }),
    organizations: loadOrganizations(),
    archived: viewer.canDelete
      ? { missionaries: loadMissionaries({ canEdit: true, canSeeArchived: true, shelf: 'archived' }), organizations: loadOrganizations({ shelf: 'archived' }) }
      : null,
    canEdit: viewer.canEdit,
    canDelete: viewer.canDelete,
  }
})
