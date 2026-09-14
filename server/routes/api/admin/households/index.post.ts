import { householdSchema } from '../../../../../shared/households.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { loadHousehold, saveHousehold } from '../../../../lib/households.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const input = await readValidatedBody(event, householdSchema.parse)

  const id = db.transaction((tx) => {
    const householdId = saveHousehold(tx, null, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'household.create', entityType: 'household', entityId: householdId })
    return householdId
  })

  setResponseStatus(event, 201)
  return { household: loadHousehold(id) }
})
