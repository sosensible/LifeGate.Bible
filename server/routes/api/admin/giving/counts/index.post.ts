import { countSchema } from '../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { openCount } from '../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['record'] })
  const input = await readValidatedBody(event, countSchema.parse)
  const id = db.transaction((tx) => {
    const countId = openCount(tx, { ...input, openedByUserId: session.user.id })
    recordAudit(tx, { actorUserId: session.user.id, action: 'count.open', entityType: 'count', entityId: countId })
    return countId
  })
  setResponseStatus(event, 201)
  return { id }
})
