import { eq } from 'drizzle-orm'
import { missionaries } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { deletePhoto } from '../../../../../lib/uploads.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsEditor(event)
  const id = getRouterParam(event, 'ref')!

  const deleted = db.transaction((tx) => {
    const row = tx.delete(missionaries).where(eq(missionaries.id, id)).returning({ id: missionaries.id, photo: missionaries.photo }).get()
    if (row) recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionary.delete', entityType: 'missionary', entityId: id })
    return row
  })
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Missionary not found' })
  deletePhoto(deleted.photo)

  setResponseStatus(event, 204)
  return null
})
