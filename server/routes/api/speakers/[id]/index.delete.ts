// Permanently remove an archived speaker. Staff and admins only, from the archive.
// A guest's record is removed. A member stays a member; they are just no longer a speaker.
import { eq } from 'drizzle-orm'
import { people } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { findSpeaker } from '../../../../lib/speakers.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireSpeakersDeleter(event)
  const id = getRouterParam(event, 'id')!
  const current = findSpeaker(id, true)
  if (!current.speakerArchivedAt) throw createError({ statusCode: 409, statusMessage: 'Archive this speaker before removing them permanently' })

  const guestRecord = current.kind === 'guest' && !current.userId && !current.householdId
  db.transaction((tx) => {
    if (guestRecord) tx.delete(people).where(eq(people.id, id)).run()
    else tx.update(people).set({ isSpeaker: false, speakerArchivedAt: null }).where(eq(people.id, id)).run()
    recordAudit(tx, {
      actorUserId: viewer.session.user.id,
      action: 'speaker.delete',
      entityType: 'person',
      entityId: id,
      note: guestRecord ? `${current.firstName} ${current.lastName}, guest record removed` : 'no longer a speaker',
    })
  })

  setResponseStatus(event, 204)
  return null
})
