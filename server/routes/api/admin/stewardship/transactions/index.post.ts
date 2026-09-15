// A hand-entered transaction, for manual accounts such as the cash box.
import { emptyToNull } from '../../../../../../shared/people.ts'
import { manualTransactionSchema } from '../../../../../../shared/stewardship.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { createManualTransaction, loadTransaction } from '../../../../../lib/transactions.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const input = emptyToNull(await readValidatedBody(event, manualTransactionSchema.parse))

  const id = db.transaction((tx) => {
    const id = createManualTransaction(tx, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'transaction.create', entityType: 'transaction', entityId: id })
    return id
  })
  setResponseStatus(event, 201)
  return { transaction: loadTransaction(id, { canManage: true }) }
})
