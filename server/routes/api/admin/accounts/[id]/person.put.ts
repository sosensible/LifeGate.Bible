// Connect an account to a directory entry.
import { accountPersonSchema } from '../../../../../../shared/accounts.ts'
import { assertCanLink, linkAccount, loadAccount } from '../../../../../lib/accounts.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { user: ['list'], people: ['update'] })
  const id = getRouterParam(event, 'id')!
  if (!loadAccount(id)) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  const { personId } = await readValidatedBody(event, accountPersonSchema.parse)
  assertCanLink(personId, id)
  db.transaction(tx => linkAccount(tx, session.user.id, personId, id))

  return { account: loadAccount(id) }
})
