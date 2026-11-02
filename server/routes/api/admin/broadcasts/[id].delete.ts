// Removes a shared broadcast, with its seats and guest codes.
import { eq } from 'drizzle-orm'
import { broadcasts } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const removed = db.transaction((tx) => {
    const row = tx.delete(broadcasts).where(eq(broadcasts.id, id)).returning({ title: broadcasts.title }).get()
    if (row) recordAudit(tx, { actorUserId: session.user.id, action: 'broadcast.delete', entityType: 'broadcast', entityId: id, note: row.title })
    return row
  })
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Broadcast not found' })
  setResponseStatus(event, 204)
  return null
})
