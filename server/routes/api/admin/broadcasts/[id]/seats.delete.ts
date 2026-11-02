// Gives every seat back, for example before the next time the broadcast is used.
import { recordAudit } from '../../../../../lib/audit.ts'
import { clearSeats, loadBroadcast, presentBroadcast } from '../../../../../lib/broadcasts.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const broadcast = loadBroadcast(id)
  if (!broadcast) throw createError({ statusCode: 404, statusMessage: 'Broadcast not found' })
  const cleared = clearSeats(id)
  recordAudit(db, { actorUserId: session.user.id, action: 'broadcast.seats', entityType: 'broadcast', entityId: id, note: `Cleared ${cleared} seats` })
  return { broadcast: presentBroadcast(broadcast) }
})
