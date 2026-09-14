// Edit a guest speaker. A member's details are kept on their profile and under People.
import { eq } from 'drizzle-orm'
import { emptyToNull } from '../../../../../shared/people.ts'
import { guestSpeakerSchema } from '../../../../../shared/speakers.ts'
import { people } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { findSpeaker, presentSpeaker } from '../../../../lib/speakers.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireSpeakersEditor(event)
  const id = getRouterParam(event, 'id')!
  const current = findSpeaker(id, viewer.canDelete)
  if (current.kind !== 'guest') {
    throw createError({ statusCode: 400, statusMessage: `${current.firstName} is a church member; their details are kept under People and on their profile` })
  }

  const values = emptyToNull(await readValidatedBody(event, guestSpeakerSchema.parse))
  const fields = (Object.keys(values) as Array<keyof typeof values>).filter(key => values[key] !== current[key])
  if (fields.length) {
    db.transaction((tx) => {
      tx.update(people).set(values).where(eq(people.id, id)).run()
      recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'speaker.update', entityType: 'person', entityId: id, fields })
    })
  }

  return { speaker: presentSpeaker(db.select().from(people).where(eq(people.id, id)).get()!) }
})
