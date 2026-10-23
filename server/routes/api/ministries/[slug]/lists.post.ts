// A ministry's leaders start a list.
import { eq } from 'drizzle-orm'
import { listInputSchema } from '../../../../../shared/ministry-lists.ts'
import { ministries } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { createList } from '../../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireListViewer(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const ministry = db.select({ id: ministries.id }).from(ministries).where(eq(ministries.slug, slug)).get()
  if (!ministry) throw createError({ statusCode: 404, statusMessage: 'Ministry not found' })
  const input = await readValidatedBody(event, listInputSchema.parse)

  const id = db.transaction((tx) => {
    const created = createList(tx, viewer, ministry.id, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'ministryList.create', entityType: 'ministryList', entityId: created })
    return created
  })
  setResponseStatus(event, 201)
  return { id }
})
