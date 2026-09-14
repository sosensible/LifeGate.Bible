// Add a speaker: a new guest record, or an existing church member.
import { eq } from 'drizzle-orm'
import { emptyToNull } from '../../../../shared/people.ts'
import { speakerAddSchema } from '../../../../shared/speakers.ts'
import { people } from '../../../database/schema/index.ts'
import { recordAudit } from '../../../lib/audit.ts'
import { db } from '../../../lib/db.ts'
import { presentSpeaker } from '../../../lib/speakers.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireSpeakersEditor(event)
  const input = await readValidatedBody(event, speakerAddSchema.parse)

  const id = db.transaction((tx) => {
    if (input.source === 'guest') {
      const { source: _, ...values } = emptyToNull(input)
      const { id } = tx.insert(people).values({ ...values, kind: 'guest', isSpeaker: true }).returning({ id: people.id }).get()
      recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'speaker.add', entityType: 'person', entityId: id, note: 'guest' })
      return id
    }

    const person = tx.select().from(people).where(eq(people.id, input.personId)).get()
    if (!person || person.kind !== 'member' || person.isMinor) {
      throw createError({ statusCode: 400, statusMessage: 'Choose an adult church member' })
    }
    if (person.isSpeaker) {
      throw createError({ statusCode: 409, statusMessage: person.speakerArchivedAt
        ? `${person.firstName} ${person.lastName} is in the speakers archive. Staff or an administrator can restore them.`
        : `${person.firstName} ${person.lastName} is already a speaker` })
    }
    tx.update(people).set({ isSpeaker: true, speakerArchivedAt: null }).where(eq(people.id, person.id)).run()
    recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'speaker.add', entityType: 'person', entityId: person.id, note: 'member' })
    return person.id
  })

  setResponseStatus(event, 201)
  return { speaker: presentSpeaker(db.select().from(people).where(eq(people.id, id)).get()!) }
})
