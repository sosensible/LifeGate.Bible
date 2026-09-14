// Permanently remove an archived missionary, with their updates and photo.
// Staff and admins only, and only from the archive.
import { eq } from 'drizzle-orm'
import { missionaries } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { findMissionary } from '../../../../../lib/missions.ts'
import { deletePhoto } from '../../../../../lib/uploads.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsDeleter(event)
  const id = getRouterParam(event, 'ref')!
  const current = findMissionary(id, true)
  if (!current.archivedAt) throw createError({ statusCode: 409, statusMessage: 'Archive this missionary before removing it permanently' })

  db.transaction((tx) => {
    tx.delete(missionaries).where(eq(missionaries.id, id)).run()
    recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionary.delete', entityType: 'missionary', entityId: id, note: current.name })
  })
  deletePhoto(current.photo)

  setResponseStatus(event, 204)
  return null
})
