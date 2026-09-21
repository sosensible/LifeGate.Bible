// Disconnect an account from its directory entry. Both are kept.
import { loadAccount, unlinkAccount } from '../../../../../lib/accounts.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { user: ['list'], people: ['update'] })
  const id = getRouterParam(event, 'id')!
  const account = loadAccount(id)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
  if (!account.person) throw createError({ statusCode: 409, statusMessage: 'This account is not connected to a directory entry' })

  db.transaction(tx => unlinkAccount(tx, session.user.id, account.person!.id))

  return { account: loadAccount(id) }
})
