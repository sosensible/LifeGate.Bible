// Archive an organization: hidden from members, kept for staff and admins to restore or remove.
// Its missionaries stay listed; members just no longer see the organization named.
import { eq } from 'drizzle-orm'
import { missionOrganizations } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { findOrganization } from '../../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsEditor(event)
  const id = getRouterParam(event, 'ref')!
  const current = findOrganization(id, viewer.canDelete)

  if (!current.archivedAt) {
    db.transaction((tx) => {
      tx.update(missionOrganizations).set({ archivedAt: new Date() }).where(eq(missionOrganizations.id, id)).run()
      recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionOrganization.archive', entityType: 'missionOrganization', entityId: id })
    })
  }

  setResponseStatus(event, 204)
  return null
})
