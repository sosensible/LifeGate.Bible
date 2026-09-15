import { loadAccounts } from '../../../../../lib/stewardship.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { stewardship: ['view'] })
  return { accounts: loadAccounts() }
})
