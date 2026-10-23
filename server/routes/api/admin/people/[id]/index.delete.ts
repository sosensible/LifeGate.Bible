// Removes the directory record. A linked sign-in account is kept; it simply
// stops being connected to a person.
import { eq } from 'drizzle-orm'
import { people } from '../../../../../database/schema/index.ts'
import { db } from '../../../../../lib/db.ts'
import { releaseTasksOf } from '../../../../../lib/ministry-lists.ts'
import { photoNameOf } from '../../../../../lib/photos.ts'
import { deletePhoto } from '../../../../../lib/uploads.ts'
import { loadPerson, recordAudit } from '../../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['delete'] })
  const id = getRouterParam(event, 'id')!
  const person = loadPerson(id)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })

  db.transaction((tx) => {
    // Before the delete: the foreign key would clear their tasks without a word.
    releaseTasksOf(tx, id)
    tx.delete(people).where(eq(people.id, id)).run()
    recordAudit(tx, { actorUserId: session.user.id, action: 'person.delete', entityType: 'person', entityId: id })
  })

  // The record is gone; so is the file, rather than lingering on the disk.
  deletePhoto(photoNameOf(person.photoUrl))

  setResponseStatus(event, 204)
  return null
})
