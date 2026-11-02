// Changes a shared broadcast: its details, who may watch, the limit, or opening and closing it.
import { broadcastUpdateSchema } from '../../../../../shared/broadcast.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { presentBroadcast, updateBroadcast } from '../../../../lib/broadcasts.ts'
import { db } from '../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, broadcastUpdateSchema.parse)
  const updated = updateBroadcast(id, input)
  recordAudit(db, { actorUserId: session.user.id, action: 'broadcast.update', entityType: 'broadcast', entityId: id, fields: Object.keys(input) })
  return { broadcast: presentBroadcast(updated) }
})
