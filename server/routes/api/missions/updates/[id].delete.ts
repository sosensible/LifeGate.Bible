import { eq } from 'drizzle-orm'
import { missionUpdates } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { findMissionary } from '../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsEditor(event)
  const id = getRouterParam(event, 'id')!
  const update = db.select({ missionaryId: missionUpdates.missionaryId }).from(missionUpdates).where(eq(missionUpdates.id, id)).get()
  if (!update) throw createError({ statusCode: 404, statusMessage: 'Update not found' })
  findMissionary(update.missionaryId, viewer.canDelete)

  const deleted = db.transaction((tx) => {
    const row = tx.delete(missionUpdates).where(eq(missionUpdates.id, id)).returning({ missionaryId: missionUpdates.missionaryId }).get()
    if (row) recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionary.updateRemoved', entityType: 'missionary', entityId: row.missionaryId })
    return row
  })
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Update not found' })

  setResponseStatus(event, 204)
  return null
})
