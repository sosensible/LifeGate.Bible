import { emptyToNull, personSchema } from '../../../../../shared/people.ts'
import { people } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { assertReferencesExist, loadPerson, presentForAdmin, recordAudit, setMinistries } from '../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['create'] })
  const { ministryIds, ...values } = emptyToNull(await readValidatedBody(event, personSchema.parse))
  assertReferencesExist({ householdId: values.householdId, ministryIds })

  // Everything the person has not chosen to share starts hidden (schema defaults).
  const id = db.transaction((tx) => {
    const { id } = tx.insert(people).values(values).returning({ id: people.id }).get()
    setMinistries(tx, id, ministryIds)
    recordAudit(tx, { actorUserId: session.user.id, action: 'person.create', entityType: 'person', entityId: id })
    return id
  })

  setResponseStatus(event, 201)
  return { person: presentForAdmin(loadPerson(id)!) }
})
