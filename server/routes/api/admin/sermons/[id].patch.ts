import { eq } from 'drizzle-orm'
import { sermonUpdateSchema } from '../../../../../shared/sermons.ts'
import { sermons } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { assertSeriesExists, assertSpeakerPerson, loadSermon, presentAdminSermon, toSermonValues } from '../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  const id = getRouterParam(event, 'id')!
  const current = loadSermon({ id })
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Message not found' })

  const input = await readValidatedBody(event, sermonUpdateSchema.parse)
  const statusChange = input.status !== undefined && input.status !== current.status
  if (statusChange) await requirePermission(event, { sermon: ['publish'] })
  assertSeriesExists(input.seriesId)
  assertSpeakerPerson(input.speakerPersonId)

  // The slug is kept even if the title or date change, so shared links keep working.
  const values = toSermonValues(input)
  if (statusChange && input.status === 'published') values.publishedAt = new Date()
  if (statusChange && input.status === 'draft') values.publishedAt = null

  const fields = Object.keys(input).filter(key => key !== 'status' || statusChange)
  if (fields.length) {
    db.transaction((tx) => {
      tx.update(sermons).set(values).where(eq(sermons.id, id)).run()
      const action = !statusChange ? 'sermon.update' : input.status === 'published' ? 'sermon.publish' : 'sermon.unpublish'
      recordAudit(tx, { actorUserId: session.user.id, action, entityType: 'sermon', entityId: id, fields })
    })
  }

  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
