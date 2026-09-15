import { eq } from 'drizzle-orm'
import { liveMeetings } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { loadLiveMeeting } from '../../../../lib/live.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const current = loadLiveMeeting(id)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Live meeting not found' })

  db.transaction((tx) => {
    tx.delete(liveMeetings).where(eq(liveMeetings.id, id)).run()
    recordAudit(tx, { actorUserId: session.user.id, action: 'liveMeeting.delete', entityType: 'liveMeeting', entityId: id, note: current.title })
  })
  return { ok: true }
})
