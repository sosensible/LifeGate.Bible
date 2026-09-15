import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { deleteMinistry, loadMinistriesForAdmin } from '../../../../lib/ministries.ts'

// The entry names the removed ministry in its note, since the record is gone.
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { ministry: ['update'] })
  const id = getRouterParam(event, 'id')!
  db.transaction((tx) => {
    const ministry = deleteMinistry(tx, id)
    recordAudit(tx, { actorUserId: session.user.id, action: 'ministry.delete', entityType: 'ministry', entityId: id, note: ministry.name })
  })
  return { ministries: loadMinistriesForAdmin() }
})
