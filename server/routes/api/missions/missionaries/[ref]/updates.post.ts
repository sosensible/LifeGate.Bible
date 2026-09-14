// Add a prayer request or prayer letter to a missionary.
import { missionUpdateSchema } from '../../../../../../shared/missions.ts'
import { emptyToNull } from '../../../../../../shared/people.ts'
import { missionUpdates } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { findMissionary, loadMissionaries } from '../../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsEditor(event)
  const id = getRouterParam(event, 'ref')!
  findMissionary(id, viewer.canDelete)

  const values = emptyToNull(await readValidatedBody(event, missionUpdateSchema.parse))
  db.transaction((tx) => {
    tx.insert(missionUpdates).values({ ...values, missionaryId: id }).run()
    recordAudit(tx, { actorUserId: viewer.session.user.id, action: `missionary.${values.kind === 'prayer' ? 'prayerRequest' : 'letter'}`, entityType: 'missionary', entityId: id })
  })

  setResponseStatus(event, 201)
  return { missionary: loadMissionaries({ canEdit: true, canSeeArchived: viewer.canDelete, id })[0] }
})
