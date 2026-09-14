// Archive a speaker: off the Speakers list, kept for staff and admins to restore or remove.
import { eq } from 'drizzle-orm'
import { people } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { findSpeaker } from '../../../../lib/speakers.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireSpeakersEditor(event)
  const id = getRouterParam(event, 'id')!
  const current = findSpeaker(id, viewer.canDelete)

  if (!current.speakerArchivedAt) {
    db.transaction((tx) => {
      tx.update(people).set({ speakerArchivedAt: new Date() }).where(eq(people.id, id)).run()
      recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'speaker.archive', entityType: 'person', entityId: id })
    })
  }

  setResponseStatus(event, 204)
  return null
})
