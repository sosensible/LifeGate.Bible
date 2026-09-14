import { eq } from 'drizzle-orm'
import { seriesSchema } from '../../../../../shared/sermons.ts'
import { sermonSeries } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  const { name, description } = await readValidatedBody(event, seriesSchema.partial({ description: true }).parse)

  if (db.select({ id: sermonSeries.id }).from(sermonSeries).where(eq(sermonSeries.name, name)).get()) {
    throw createError({ statusCode: 409, statusMessage: 'A series with that name already exists' })
  }

  const series = db.transaction((tx) => {
    const row = tx.insert(sermonSeries).values({ name, description: description || null })
      .returning({ id: sermonSeries.id, name: sermonSeries.name, description: sermonSeries.description }).get()
    recordAudit(tx, { actorUserId: session.user.id, action: 'series.create', entityType: 'sermonSeries', entityId: row.id })
    return row
  })

  setResponseStatus(event, 201)
  return { series: { ...series, sermonCount: 0 } }
})
