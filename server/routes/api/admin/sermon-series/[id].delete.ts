// Deleting a series keeps its sermons; they simply have no series.
import { eq } from 'drizzle-orm'
import { sermonSeries } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  const id = getRouterParam(event, 'id')!

  const deleted = db.transaction((tx) => {
    const row = tx.delete(sermonSeries).where(eq(sermonSeries.id, id)).returning({ id: sermonSeries.id }).get()
    if (row) recordAudit(tx, { actorUserId: session.user.id, action: 'series.delete', entityType: 'sermonSeries', entityId: id })
    return row
  })
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Series not found' })

  setResponseStatus(event, 204)
  return null
})
