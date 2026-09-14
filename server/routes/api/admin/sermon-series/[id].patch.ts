import { and, eq, ne } from 'drizzle-orm'
import { seriesSchema } from '../../../../../shared/sermons.ts'
import { sermonSeries } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  const id = getRouterParam(event, 'id')!
  const changes = await readValidatedBody(event, seriesSchema.partial().parse)

  if (changes.name && db.select({ id: sermonSeries.id }).from(sermonSeries)
    .where(and(eq(sermonSeries.name, changes.name), ne(sermonSeries.id, id))).get()) {
    throw createError({ statusCode: 409, statusMessage: 'A series with that name already exists' })
  }

  const updated = db.transaction((tx) => {
    const row = tx.update(sermonSeries)
      .set({ ...changes, ...(changes.description !== undefined ? { description: changes.description || null } : {}) })
      .where(eq(sermonSeries.id, id))
      .returning({ id: sermonSeries.id, name: sermonSeries.name, description: sermonSeries.description }).get()
    if (row) recordAudit(tx, { actorUserId: session.user.id, action: 'series.update', entityType: 'sermonSeries', entityId: id, fields: Object.keys(changes) })
    return row
  })
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Series not found' })

  return { series: updated }
})
