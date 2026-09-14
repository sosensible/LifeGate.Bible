import { organizationSchema } from '../../../../../shared/missions.ts'
import { emptyToNull } from '../../../../../shared/people.ts'
import { missionOrganizations } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { loadOrganizations, uniqueSlug } from '../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsEditor(event)
  const values = emptyToNull(await readValidatedBody(event, organizationSchema.parse))

  const id = db.transaction((tx) => {
    const { id } = tx.insert(missionOrganizations).values({ ...values, slug: uniqueSlug(missionOrganizations, values.name) })
      .returning({ id: missionOrganizations.id }).get()
    recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionOrganization.create', entityType: 'missionOrganization', entityId: id })
    return id
  })

  setResponseStatus(event, 201)
  return { organization: loadOrganizations().find(o => o.id === id) }
})
