import { ministrySchema } from '../../../../../shared/ministries.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { loadMinistriesForAdmin, updateMinistry } from '../../../../lib/ministries.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { ministry: ['update'] })
  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, ministrySchema.parse)
  db.transaction((tx) => {
    const fields = updateMinistry(tx, id, input)
    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'ministry.update', entityType: 'ministry', entityId: id, fields })
  })
  return { ministries: loadMinistriesForAdmin() }
})
