import { loadTransaction } from '../../../../../lib/transactions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await getStewardshipViewer(event)
  if (!viewer.canView) throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  const transaction = loadTransaction(getRouterParam(event, 'id')!, { canManage: viewer.canManage })
  if (!transaction) throw createError({ statusCode: 404, statusMessage: 'Transaction not found' })
  return { transaction }
})
