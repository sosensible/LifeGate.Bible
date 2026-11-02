// Make a directory entry for an account that has none, from its name and email, and
// connect them. The office fills in the rest on the People page.
import { createDirectoryEntry, loadAccount } from '../../../../../lib/accounts.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { user: ['list'], people: ['create', 'update'] })
  const id = getRouterParam(event, 'id')!
  if (!loadAccount(id)) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
  const personId = db.transaction(tx => createDirectoryEntry(tx, session.user.id, id))
  setResponseStatus(event, 201)
  return { personId, account: loadAccount(id) }
})
