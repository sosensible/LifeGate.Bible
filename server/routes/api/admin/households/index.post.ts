import { householdSchema } from '../../../../../shared/people.ts'
import { households } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { recordAudit } from '../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const { name } = await readValidatedBody(event, householdSchema.parse)

  const household = db.transaction((tx) => {
    const row = tx.insert(households).values({ name }).returning({ id: households.id, name: households.name }).get()
    recordAudit(tx, { actorUserId: session.user.id, action: 'household.create', entityType: 'household', entityId: row.id })
    return row
  })

  setResponseStatus(event, 201)
  return { household: { ...household, memberCount: 0 } }
})
