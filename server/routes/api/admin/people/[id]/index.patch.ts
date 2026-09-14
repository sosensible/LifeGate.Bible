import { eq } from 'drizzle-orm'
import { emptyToNull, personUpdateSchema } from '../../../../../../shared/people.ts'
import { people } from '../../../../../database/schema/index.ts'
import { db } from '../../../../../lib/db.ts'
import { assertReferencesExist, assertStaffCanReview, loadPerson, presentForAdmin, recordAudit, setMinistries } from '../../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  const person = loadPerson(id)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })

  const { ministryIds, ...values } = emptyToNull(await readValidatedBody(event, personUpdateSchema.parse))
  assertStaffCanReview(person, Object.keys(values))
  assertReferencesExist({ householdId: values.householdId, ministryIds })

  const fields = [...Object.keys(values), ...(ministryIds ? ['ministries'] : [])]
  if (fields.length) {
    db.transaction((tx) => {
      if (Object.keys(values).length) tx.update(people).set(values).where(eq(people.id, id)).run()
      if (ministryIds) setMinistries(tx, id, ministryIds)
      recordAudit(tx, { actorUserId: session.user.id, action: 'person.update', entityType: 'person', entityId: id, fields })
    })
  }

  return { person: presentForAdmin(loadPerson(id)!) }
})
