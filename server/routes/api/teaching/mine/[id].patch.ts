import { eq } from 'drizzle-orm'
import { teacherSermonSchema } from '../../../../../shared/sermons.ts'
import { sermons } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { assertSeriesExists, isTeacherOf, loadSermon, presentAdminSermon, toSermonValues } from '../../../../lib/sermons.ts'

// A teacher edits their own message: details only. The video, speaker, who can
// watch and publishing stay with the people who manage sermons.
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const id = getRouterParam(event, 'id')!
  const current = loadSermon({ id })
  if (!current || !isTeacherOf(current, session.user.id)) {
    throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  }

  const parsed = teacherSermonSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    const other = parsed.error.issues.some(issue => issue.code === 'unrecognized_keys')
    throw createError({
      statusCode: 400,
      statusMessage: other ? 'Only the title, date, series, passage, books, topics and notes can be changed here' : parsed.error.issues[0]?.message ?? 'Check the details',
    })
  }
  const input = parsed.data
  assertSeriesExists(input.seriesId)

  // The slug is kept even if the title or date change, so shared links keep working.
  const values = toSermonValues(input)
  const fields = Object.keys(input)
  if (fields.length) {
    db.transaction((tx) => {
      tx.update(sermons).set(values).where(eq(sermons.id, id)).run()
      recordAudit(tx, { actorUserId: session.user.id, action: 'sermon.update', entityType: 'sermon', entityId: id, fields, note: 'By its teacher' })
    })
  }
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
