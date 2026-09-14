// Bring an archived organization back. Staff and admins only.
import { eq } from 'drizzle-orm'
import { missionOrganizations } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { findOrganization } from '../../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsDeleter(event)
  const id = getRouterParam(event, 'ref')!
  const current = findOrganization(id, viewer.canDelete)

  if (current.archivedAt) {
    db.transaction((tx) => {
      tx.update(missionOrganizations).set({ archivedAt: null }).where(eq(missionOrganizations.id, id)).run()
      recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionOrganization.restore', entityType: 'missionOrganization', entityId: id })
    })
  }

  setResponseStatus(event, 204)
  return null
})
