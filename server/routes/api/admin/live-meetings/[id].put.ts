import { eq } from 'drizzle-orm'
import { liveMeetingSchema } from '../../../../../shared/live.ts'
import { liveMeetings } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { loadLiveMeeting, presentAdminLiveMeeting, toLiveMeetingValues } from '../../../../lib/live.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const current = loadLiveMeeting(id)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Live meeting not found' })

  const values = toLiveMeetingValues(await readValidatedBody(event, liveMeetingSchema.parse))
  // Names the fields that changed, never the link itself.
  const fields = (Object.keys(values) as Array<keyof typeof values>)
    .filter(key => JSON.stringify(values[key]) !== JSON.stringify(current[key]))

  if (fields.length) {
    db.transaction((tx) => {
      tx.update(liveMeetings).set(values).where(eq(liveMeetings.id, id)).run()
      recordAudit(tx, { actorUserId: session.user.id, action: 'liveMeeting.update', entityType: 'liveMeeting', entityId: id, fields })
    })
  }

  return { meeting: presentAdminLiveMeeting(loadLiveMeeting(id)!) }
})
