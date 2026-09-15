import { giverSchema } from '../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { createGiver, loadGiver } from '../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['manage'] })
  const input = await readValidatedBody(event, giverSchema.parse)
  const id = db.transaction((tx) => {
    const giverId = createGiver(tx, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'giver.create', entityType: 'giver', entityId: giverId })
    return giverId
  })
  setResponseStatus(event, 201)
  return { giver: loadGiver(id, yearQuery(event)) }
})
