// Replace a household's structure: kind, adults, children and name.
import { householdSchema } from '../../../../../shared/households.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { loadHousehold, saveHousehold } from '../../../../lib/households.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  if (!loadHousehold(id)) throw createError({ statusCode: 404, statusMessage: 'Household not found' })

  const input = await readValidatedBody(event, householdSchema.parse)
  db.transaction((tx) => {
    saveHousehold(tx, id, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'household.update', entityType: 'household', entityId: id, fields: ['kind', 'members', 'name'] })
  })

  return { household: loadHousehold(id) }
})
