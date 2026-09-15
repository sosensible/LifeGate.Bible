import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { loadCount, unlinkDeposit } from '../../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['manage'], stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  db.transaction((tx) => {
    const transactionId = unlinkDeposit(tx, id)
    recordAudit(tx, { actorUserId: session.user.id, action: 'count.unlinkDeposit', entityType: 'count', entityId: id })
    recordAudit(tx, { actorUserId: session.user.id, action: 'transaction.categorize', entityType: 'transaction', entityId: transactionId })
  })
  return { count: loadCount(id) }
})
