import { linkDepositSchema } from '../../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { linkDeposit, loadCount, recordDeposit } from '../../../../../../lib/giving.ts'

// Splitting the deposit also changes the budget, so it needs both permissions.
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['manage'], stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, linkDepositSchema.parse)
  db.transaction((tx) => {
    const transactionId = input.mode === 'link'
      ? linkDeposit(tx, id, input.transactionId)
      : recordDeposit(tx, id, input.accountId, input.postedOn)
    recordAudit(tx, { actorUserId: session.user.id, action: 'count.linkDeposit', entityType: 'count', entityId: id })
    recordAudit(tx, { actorUserId: session.user.id, action: input.mode === 'link' ? 'transaction.categorize' : 'transaction.create', entityType: 'transaction', entityId: transactionId })
  })
  return { count: loadCount(id) }
})
