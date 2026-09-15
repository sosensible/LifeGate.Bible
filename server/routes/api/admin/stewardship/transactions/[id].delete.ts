// Hand-entered transactions only; bank transactions cannot be removed.
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { deleteManualTransaction } from '../../../../../lib/transactions.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!

  db.transaction((tx) => {
    deleteManualTransaction(tx, id)
    recordAudit(tx, { actorUserId: session.user.id, action: 'transaction.delete', entityType: 'transaction', entityId: id })
  })
  setResponseStatus(event, 204)
  return null
})
