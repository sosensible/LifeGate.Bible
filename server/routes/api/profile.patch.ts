// A person updating their own contact details and privacy choices.
import { eq } from 'drizzle-orm'
import { emptyToNull, profileUpdateSchema } from '../../../shared/people.ts'
import { people } from '../../database/schema/index.ts'
import { db } from '../../lib/db.ts'
import { findPersonByUserId, loadPerson, recordAudit, setRosterChoices } from '../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const link = findPersonByUserId(session.user.id)
  if (!link) {
    throw createError({ statusCode: 404, statusMessage: 'Your account is not linked to a directory entry' })
  }

  const { rosters, ...changes } = emptyToNull(await readValidatedBody(event, profileUpdateSchema.parse))
  const fields = [...Object.keys(changes), ...(rosters ? ['ministryRosters'] : [])]

  if (fields.length) {
    db.transaction((tx) => {
      if (Object.keys(changes).length) tx.update(people).set(changes).where(eq(people.id, link.id)).run()
      if (rosters) setRosterChoices(tx, link.id, rosters)
      recordAudit(tx, { actorUserId: session.user.id, action: 'profile.update', entityType: 'person', entityId: link.id, fields })
    })
  }

  const { account: _account, userId: _userId, ...person } = loadPerson(link.id)!
  return { person }
})
