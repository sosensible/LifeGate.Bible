import { quickGiverSchema } from '../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { createQuickGiver } from '../../../../../lib/giving.ts'

// Counters add a new giver by name; the Treasurer completes the record later.
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['record'] })
  const { statementName } = await readValidatedBody(event, quickGiverSchema.parse)
  const id = db.transaction((tx) => {
    const giverId = createQuickGiver(tx, statementName)
    recordAudit(tx, { actorUserId: session.user.id, action: 'giver.create', entityType: 'giver', entityId: giverId })
    return giverId
  })
  setResponseStatus(event, 201)
  return { giver: { id, statementName } }
})
