// Removes the directory record. A linked sign-in account is kept; it simply
// stops being connected to a person.
import { eq } from 'drizzle-orm'
import { people } from '../../../../../database/schema/index.ts'
import { db } from '../../../../../lib/db.ts'
import { loadPerson, recordAudit } from '../../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['delete'] })
  const id = getRouterParam(event, 'id')!
  if (!loadPerson(id)) throw createError({ statusCode: 404, statusMessage: 'Person not found' })

  db.transaction((tx) => {
    tx.delete(people).where(eq(people.id, id)).run()
    recordAudit(tx, { actorUserId: session.user.id, action: 'person.delete', entityType: 'person', entityId: id })
  })

  setResponseStatus(event, 204)
  return null
})
