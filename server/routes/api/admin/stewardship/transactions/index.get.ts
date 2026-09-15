import { transactionsQuerySchema } from '../../../../../../shared/stewardship.ts'
import { countUncategorized } from '../../../../../lib/budget.ts'
import { loadTransactions } from '../../../../../lib/transactions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await getStewardshipViewer(event)
  if (!viewer.canView) throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  const query = await getValidatedQuery(event, transactionsQuerySchema.parse)
  return {
    ...loadTransactions(query, { canManage: viewer.canManage }),
    uncategorized: countUncategorized(),
  }
})
