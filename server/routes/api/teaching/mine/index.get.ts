import { asc } from 'drizzle-orm'
import { sermonSeries } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { loadTeacherSermons, presentAdminSermon } from '../../../../lib/sermons.ts'

// The signed-in teacher's own messages, drafts included, and the series to choose from.
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const sermons = loadTeacherSermons(session.user.id).map(presentAdminSermon)
  return {
    sermons,
    series: sermons.length ? db.select({ id: sermonSeries.id, name: sermonSeries.name }).from(sermonSeries).orderBy(asc(sermonSeries.name)).all() : [],
  }
})
