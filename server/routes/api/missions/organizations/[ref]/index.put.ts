import { eq } from 'drizzle-orm'
import { organizationSchema } from '../../../../../../shared/missions.ts'
import { emptyToNull } from '../../../../../../shared/people.ts'
import { missionOrganizations } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { findOrganization, loadOrganizations } from '../../../../../lib/missions.ts'
import { deletePhoto } from '../../../../../lib/uploads.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsEditor(event)
  const id = getRouterParam(event, 'ref')!
  const current = findOrganization(id, viewer.canDelete)

  const values = emptyToNull(await readValidatedBody(event, organizationSchema.parse))
  db.transaction((tx) => {
    tx.update(missionOrganizations).set(values).where(eq(missionOrganizations.id, id)).run()
    recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionOrganization.update', entityType: 'missionOrganization', entityId: id })
  })
  if (current.photo !== values.photo) deletePhoto(current.photo)

  return { organization: loadOrganizations({ id })[0] }
})
