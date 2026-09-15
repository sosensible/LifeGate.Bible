import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { closeCount, loadCount } from '../../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['manage'] })
  const id = getRouterParam(event, 'id')!
  db.transaction((tx) => {
    closeCount(tx, id, session.user.id)
    recordAudit(tx, { actorUserId: session.user.id, action: 'count.close', entityType: 'count', entityId: id })
  })
  return { count: loadCount(id) }
})
