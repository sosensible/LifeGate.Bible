// Categorize a transaction: one or more lines that add up to its amount.
import { splitsSchema } from '../../../../../../../shared/stewardship.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { loadTransaction, replaceSplits } from '../../../../../../lib/transactions.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const { splits } = await readValidatedBody(event, splitsSchema.parse)

  db.transaction((tx) => {
    replaceSplits(tx, id, splits.map(split => ({ ...split, memo: split.memo || null })))
    recordAudit(tx, { actorUserId: session.user.id, action: 'transaction.categorize', entityType: 'transaction', entityId: id })
  })
  return { transaction: loadTransaction(id, { canManage: true }) }
})
