// Removing an organization keeps its missionaries; they simply have none.
import { eq } from 'drizzle-orm'
import { missionOrganizations } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { deletePhoto } from '../../../../lib/uploads.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsEditor(event)
  const id = getRouterParam(event, 'ref')!

  const deleted = db.transaction((tx) => {
    const row = tx.delete(missionOrganizations).where(eq(missionOrganizations.id, id)).returning({ id: missionOrganizations.id, photo: missionOrganizations.photo }).get()
    if (row) recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionOrganization.delete', entityType: 'missionOrganization', entityId: id })
    return row
  })
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  deletePhoto(deleted.photo)

  setResponseStatus(event, 204)
  return null
})
