// Staff changing someone's sharing choices on their behalf, e.g. a homebound
// member who asked by phone. Separate permission, and always audited.
import { eq } from 'drizzle-orm'
import { privacyUpdateSchema } from '../../../../../../shared/people.ts'
import { people } from '../../../../../database/schema/index.ts'
import { db } from '../../../../../lib/db.ts'
import { loadPerson, presentForAdmin, recordAudit } from '../../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['managePrivacy'] })
  const id = getRouterParam(event, 'id')!
  if (!loadPerson(id)) throw createError({ statusCode: 404, statusMessage: 'Person not found' })

  const changes = await readValidatedBody(event, privacyUpdateSchema.parse)
  const fields = Object.keys(changes)
  if (fields.length) {
    db.transaction((tx) => {
      tx.update(people).set(changes).where(eq(people.id, id)).run()
      recordAudit(tx, { actorUserId: session.user.id, action: 'privacy.update', entityType: 'person', entityId: id, fields })
    })
  }

  return { person: presentForAdmin(loadPerson(id)!) }
})
