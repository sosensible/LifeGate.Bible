// Set or replace a person's photo. Staff only, at any time. The photo reaches other
// members only once the person shares it; the person always sees their own.
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadPerson } from '../../../../../lib/people.ts'
import { setPersonPhoto } from '../../../../../lib/photos.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  const person = loadPerson(id)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })

  const photoUrl = setPersonPhoto(id, await readUploadedPhoto(event))
  recordAudit(db, { actorUserId: session.user.id, action: 'person.photo', entityType: 'person', entityId: id, fields: ['photo'] })
  setResponseStatus(event, 201)
  return { photoUrl }
})
