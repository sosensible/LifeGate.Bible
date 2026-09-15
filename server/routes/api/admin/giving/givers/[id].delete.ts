import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { deleteGiver } from '../../../../../lib/giving.ts'

// Only a record with no gifts; others are archived.
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['manage'] })
  const id = getRouterParam(event, 'id')!
  db.transaction((tx) => {
    deleteGiver(tx, id)
    recordAudit(tx, { actorUserId: session.user.id, action: 'giver.delete', entityType: 'giver', entityId: id })
  })
  return { ok: true }
})
