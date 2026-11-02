// Gives a guest a new code: the old one, and the browser it was tied to, stop working.
import { recordAudit } from '../../../../../../../lib/audit.ts'
import { loadBroadcast, presentBroadcast, resetPass } from '../../../../../../../lib/broadcasts.ts'
import { db } from '../../../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const passId = getRouterParam(event, 'passId')!
  const broadcast = loadBroadcast(id)
  if (!broadcast) throw createError({ statusCode: 404, statusMessage: 'Broadcast not found' })
  const { code } = resetPass(passId)
  recordAudit(db, { actorUserId: session.user.id, action: 'broadcast.pass', entityType: 'broadcast', entityId: id, note: 'Replaced a guest code' })
  setHeader(event, 'cache-control', 'no-store')
  return { code, broadcast: presentBroadcast(broadcast) }
})
