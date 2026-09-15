import { ministrySchema } from '../../../../../shared/ministries.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { createMinistry, loadMinistriesForAdmin } from '../../../../lib/ministries.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { ministry: ['update'] })
  const input = await readValidatedBody(event, ministrySchema.parse)
  db.transaction((tx) => {
    const id = createMinistry(tx, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'ministry.create', entityType: 'ministry', entityId: id })
  })
  setResponseStatus(event, 201)
  return { ministries: loadMinistriesForAdmin() }
})
