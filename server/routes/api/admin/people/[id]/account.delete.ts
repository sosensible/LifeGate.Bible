// Disconnect a sign-in account from a person. The account itself is kept;
// removing or banning accounts belongs to account management.
import { unlinkAccount } from '../../../../../lib/accounts.ts'
import { db } from '../../../../../lib/db.ts'
import { loadPerson, presentForAdmin } from '../../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  if (!loadPerson(id)) throw createError({ statusCode: 404, statusMessage: 'Person not found' })

  db.transaction(tx => unlinkAccount(tx, session.user.id, id))

  return { person: presentForAdmin(loadPerson(id)!) }
})
