// Permanently remove an archived organization. Its missionaries are kept,
// with no organization. Staff and admins only, and only from the archive.
import { eq } from 'drizzle-orm'
import { missionOrganizations } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { findOrganization } from '../../../../../lib/missions.ts'
import { deletePhoto } from '../../../../../lib/uploads.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsDeleter(event)
  const id = getRouterParam(event, 'ref')!
  const current = findOrganization(id, true)
  if (!current.archivedAt) throw createError({ statusCode: 409, statusMessage: 'Archive this organization before removing it permanently' })

  db.transaction((tx) => {
    tx.delete(missionOrganizations).where(eq(missionOrganizations.id, id)).run()
    recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionOrganization.delete', entityType: 'missionOrganization', entityId: id, note: current.name })
  })
  deletePhoto(current.photo)

  setResponseStatus(event, 204)
  return null
})
