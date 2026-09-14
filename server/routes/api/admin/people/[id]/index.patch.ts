import { eq } from 'drizzle-orm'
import { emptyToNull, personUpdateSchema } from '../../../../../../shared/people.ts'
import { people } from '../../../../../database/schema/index.ts'
import { db } from '../../../../../lib/db.ts'
import { refreshHouseholdName } from '../../../../../lib/households.ts'
import { assertReferencesExist, assertStaffCanReview, loadPerson, presentForAdmin, recordAudit, setMinistries } from '../../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  const person = loadPerson(id)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })

  const { ministryIds, leaderMinistryIds, ...values } = emptyToNull(await readValidatedBody(event, personUpdateSchema.parse))
  assertStaffCanReview(person, Object.keys(values))
  if (leaderMinistryIds && !ministryIds) {
    throw createError({ statusCode: 400, statusMessage: 'Send the ministries along with who leads them' })
  }
  assertReferencesExist({ ministryIds, leaderMinistryIds })
  if (values.kind === 'guest' && person.householdId) {
    throw createError({ statusCode: 400, statusMessage: `Remove ${person.firstName} from ${person.householdName ?? 'their household'} before marking them a guest` })
  }

  // No longer a speaker: nothing left to archive.
  const extra = values.isSpeaker === false ? { speakerArchivedAt: null } : {}

  const fields = [...Object.keys(values), ...(ministryIds ? ['ministries'] : [])]
  if (fields.length) {
    db.transaction((tx) => {
      if (Object.keys(values).length) tx.update(people).set({ ...values, ...extra }).where(eq(people.id, id)).run()
      if (ministryIds) setMinistries(tx, id, ministryIds, leaderMinistryIds)
      // "James & Sarah Mitchell Household" follows a change to James's or Sarah's name.
      if (values.firstName !== undefined || values.lastName !== undefined) refreshHouseholdName(tx, person.householdId)
      recordAudit(tx, { actorUserId: session.user.id, action: 'person.update', entityType: 'person', entityId: id, fields })
    })
  }

  return { person: presentForAdmin(loadPerson(id)!) }
})
