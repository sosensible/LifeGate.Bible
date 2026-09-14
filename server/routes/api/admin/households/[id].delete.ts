// Deleting a household keeps its people; they simply have no household.
import { eq } from 'drizzle-orm'
import { households } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { recordAudit } from '../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!

  const deleted = db.transaction((tx) => {
    const row = tx.delete(households).where(eq(households.id, id)).returning({ id: households.id }).get()
    if (row) recordAudit(tx, { actorUserId: session.user.id, action: 'household.delete', entityType: 'household', entityId: id })
    return row
  })
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Household not found' })

  setResponseStatus(event, 204)
  return null
})
