import { loadPayeeRules } from '../../../../../lib/transactions.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { stewardship: ['manage'] })
  return { rules: loadPayeeRules() }
})
