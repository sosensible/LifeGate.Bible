// Turns a guest's code off for good, and gives its seat back.
import { recordAudit } from '../../../../../../lib/audit.ts'
import { loadBroadcast, presentBroadcast, revokePass } from '../../../../../../lib/broadcasts.ts'
import { db } from '../../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const broadcast = loadBroadcast(id)
  if (!broadcast) throw createError({ statusCode: 404, statusMessage: 'Broadcast not found' })
  revokePass(getRouterParam(event, 'passId')!)
  recordAudit(db, { actorUserId: session.user.id, action: 'broadcast.pass', entityType: 'broadcast', entityId: id, note: 'Turned off a guest code' })
  return { broadcast: presentBroadcast(broadcast) }
})
