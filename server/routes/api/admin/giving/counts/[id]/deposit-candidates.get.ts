import { db } from '../../../../../../lib/db.ts'
import { depositCandidates, findCount, manualCashAccounts } from '../../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { giving: ['manage'] })
  const id = getRouterParam(event, 'id')!
  findCount(db, id)
  return { candidates: depositCandidates(id), manualAccounts: manualCashAccounts() }
})
