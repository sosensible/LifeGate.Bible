import { missionarySchema } from '../../../../../shared/missions.ts'
import { emptyToNull } from '../../../../../shared/people.ts'
import { missionaries } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { assertOrganizationExists, loadMissionaries, uniqueSlug } from '../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsEditor(event)
  const values = emptyToNull(await readValidatedBody(event, missionarySchema.parse))
  assertOrganizationExists(values.organizationId)

  const id = db.transaction((tx) => {
    const { id } = tx.insert(missionaries).values({ ...values, slug: uniqueSlug(missionaries, values.name) }).returning({ id: missionaries.id }).get()
    recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionary.create', entityType: 'missionary', entityId: id })
    return id
  })

  setResponseStatus(event, 201)
  return { missionary: loadMissionaries({ canEdit: true, id })[0] }
})
