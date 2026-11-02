// Adds a shared broadcast.
import { broadcastSchema } from '../../../../../shared/broadcast.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { createBroadcast, presentBroadcast } from '../../../../lib/broadcasts.ts'
import { db } from '../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const input = await readValidatedBody(event, broadcastSchema.parse)
  const created = createBroadcast(input, session.user.id)
  recordAudit(db, { actorUserId: session.user.id, action: 'broadcast.create', entityType: 'broadcast', entityId: created.id, note: created.title })
  setResponseStatus(event, 201)
  return { broadcast: presentBroadcast(created) }
})
