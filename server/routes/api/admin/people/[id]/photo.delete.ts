// Remove a person's photo. Staff only, at any time.
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadPerson } from '../../../../../lib/people.ts'
import { clearPersonPhoto } from '../../../../../lib/photos.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  const person = loadPerson(id)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })

  clearPersonPhoto(id)
  recordAudit(db, { actorUserId: session.user.id, action: 'person.photo', entityType: 'person', entityId: id, fields: ['photo'], note: 'removed' })
  setResponseStatus(event, 204)
  return null
})
