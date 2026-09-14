// Disconnect a sign-in account from a person. The account itself is kept;
// removing or banning accounts belongs to account management.
import { eq } from 'drizzle-orm'
import { people } from '../../../../../database/schema/index.ts'
import { db } from '../../../../../lib/db.ts'
import { loadPerson, presentForAdmin, recordAudit } from '../../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  if (!loadPerson(id)) throw createError({ statusCode: 404, statusMessage: 'Person not found' })

  db.transaction((tx) => {
    tx.update(people).set({ userId: null }).where(eq(people.id, id)).run()
    recordAudit(tx, { actorUserId: session.user.id, action: 'account.unlink', entityType: 'person', entityId: id })
  })

  return { person: presentForAdmin(loadPerson(id)!) }
})
