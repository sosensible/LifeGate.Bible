import { asc, count, eq } from 'drizzle-orm'
import { sermonSeries, sermons } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { sermon: ['update'] })
  const series = db
    .select({ id: sermonSeries.id, name: sermonSeries.name, description: sermonSeries.description, sermonCount: count(sermons.id) })
    .from(sermonSeries)
    .leftJoin(sermons, eq(sermons.seriesId, sermonSeries.id))
    .groupBy(sermonSeries.id)
    .orderBy(asc(sermonSeries.name))
    .all()
  return { series }
})
