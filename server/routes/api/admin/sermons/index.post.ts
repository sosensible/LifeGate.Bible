import { sermonSchema } from '../../../../../shared/sermons.ts'
import { sermons } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { assertSeriesExists, loadSermon, presentAdminSermon, toSermonValues, uniqueSermonSlug } from '../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['create'] })
  const input = await readValidatedBody(event, sermonSchema.parse)

  // Going straight to published is publishing.
  if (input.status === 'published') await requirePermission(event, { sermon: ['publish'] })
  assertSeriesExists(input.seriesId)

  const values = toSermonValues(input)
  const id = db.transaction((tx) => {
    const { id } = tx.insert(sermons).values({
      ...values,
      title: input.title,
      preachedOn: input.preachedOn,
      speaker: input.speaker,
      slug: uniqueSermonSlug(input.preachedOn, input.title),
      publishedAt: input.status === 'published' ? new Date() : null,
    }).returning({ id: sermons.id }).get()
    recordAudit(tx, { actorUserId: session.user.id, action: input.status === 'published' ? 'sermon.publish' : 'sermon.create', entityType: 'sermon', entityId: id })
    return id
  })

  setResponseStatus(event, 201)
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
