import { loadAccounts } from '../../../../lib/accounts.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { user: ['list'] })
  return { accounts: loadAccounts() }
})
