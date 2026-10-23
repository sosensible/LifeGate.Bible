// One ministry's lists, as the signed-in person may see them. A leaders-only
// list is not loaded at all for anyone who cannot see it.
import { eq } from 'drizzle-orm'
import { ministries } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { loadMinistryListsPayload } from '../../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireListViewer(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const ministry = db.select({ id: ministries.id }).from(ministries).where(eq(ministries.slug, slug)).get()
  if (!ministry) throw createError({ statusCode: 404, statusMessage: 'Ministry not found' })
  return loadMinistryListsPayload(viewer, ministry.id)
})
