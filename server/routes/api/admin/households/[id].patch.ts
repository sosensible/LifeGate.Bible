import { eq } from 'drizzle-orm'
import { householdSchema } from '../../../../../shared/people.ts'
import { households } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { recordAudit } from '../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  const { name } = await readValidatedBody(event, householdSchema.parse)

  const updated = db.transaction((tx) => {
    const row = tx.update(households).set({ name }).where(eq(households.id, id)).returning({ id: households.id, name: households.name }).get()
    if (row) recordAudit(tx, { actorUserId: session.user.id, action: 'household.update', entityType: 'household', entityId: id, fields: ['name'] })
    return row
  })
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Household not found' })

  return { household: updated }
})
