// Makes a code for one guest. The code is in the answer once, and is never shown again.
import { passSchema } from '../../../../../../../shared/broadcast.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { createPass, loadBroadcast, presentBroadcast } from '../../../../../../lib/broadcasts.ts'
import { db } from '../../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const broadcast = loadBroadcast(id)
  if (!broadcast) throw createError({ statusCode: 404, statusMessage: 'Broadcast not found' })
  const { label } = await readValidatedBody(event, passSchema.parse)
  const { pass, code } = createPass(id, label, session.user.id)
  recordAudit(db, { actorUserId: session.user.id, action: 'broadcast.pass', entityType: 'broadcast', entityId: id, note: `Made a code for ${label}` })
  setHeader(event, 'cache-control', 'no-store')
  setResponseStatus(event, 201)
  return { code, passId: pass.id, broadcast: presentBroadcast(broadcast) }
})
