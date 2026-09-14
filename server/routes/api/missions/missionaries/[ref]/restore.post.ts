// Bring an archived missionary back. Staff and admins only.
import { eq } from 'drizzle-orm'
import { missionaries } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { findMissionary } from '../../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsDeleter(event)
  const id = getRouterParam(event, 'ref')!
  const current = findMissionary(id, viewer.canDelete)

  if (current.archivedAt) {
    db.transaction((tx) => {
      tx.update(missionaries).set({ archivedAt: null }).where(eq(missionaries.id, id)).run()
      recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionary.restore', entityType: 'missionary', entityId: id })
    })
  }

  setResponseStatus(event, 204)
  return null
})
