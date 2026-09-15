// Removes the sermon from the site. The video itself stays on YouTube.
import { eq } from 'drizzle-orm'
import { sermons } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { recordAudit } from '../../../../lib/audit.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['delete'] })
  const id = getRouterParam(event, 'id')!

  const deleted = db.transaction((tx) => {
    const row = tx.delete(sermons).where(eq(sermons.id, id)).returning({ id: sermons.id }).get()
    if (row) recordAudit(tx, { actorUserId: session.user.id, action: 'sermon.delete', entityType: 'sermon', entityId: id })
    return row
  })
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Message not found' })

  setResponseStatus(event, 204)
  return null
})
