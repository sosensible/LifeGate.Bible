import { emptyToNull } from '../../../../../../shared/people.ts'
import { transactionUpdateSchema } from '../../../../../../shared/stewardship.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadTransaction, updateTransaction } from '../../../../../lib/transactions.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const changes = emptyToNull(await readValidatedBody(event, transactionUpdateSchema.parse))

  db.transaction((tx) => {
    const fields = updateTransaction(tx, id, changes)
    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'transaction.update', entityType: 'transaction', entityId: id, fields })
  })
  return { transaction: loadTransaction(id, { canManage: true }) }
})
