// Replace a missionary entry. The link (slug) stays the same after a rename.
import { eq } from 'drizzle-orm'
import { missionarySchema } from '../../../../../../shared/missions.ts'
import { emptyToNull } from '../../../../../../shared/people.ts'
import { missionaries } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { assertOrganizationExists, findMissionary, loadMissionaries } from '../../../../../lib/missions.ts'
import { deletePhoto } from '../../../../../lib/uploads.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsEditor(event)
  const id = getRouterParam(event, 'ref')!
  const current = findMissionary(id, viewer.canDelete)

  const values = emptyToNull(await readValidatedBody(event, missionarySchema.parse))
  assertOrganizationExists(values.organizationId, current.organizationId)

  db.transaction((tx) => {
    tx.update(missionaries).set(values).where(eq(missionaries.id, id)).run()
    recordAudit(tx, { actorUserId: viewer.session.user.id, action: 'missionary.update', entityType: 'missionary', entityId: id })
  })
  // A replaced or removed photo is deleted from disk.
  if (current.photo !== values.photo) deletePhoto(current.photo)

  return { missionary: loadMissionaries({ canEdit: true, canSeeArchived: viewer.canDelete, id })[0] }
})
