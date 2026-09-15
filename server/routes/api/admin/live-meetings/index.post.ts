import { liveMeetingSchema } from '../../../../../shared/live.ts'
import { liveMeetings } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { loadLiveMeeting, presentAdminLiveMeeting, toLiveMeetingValues } from '../../../../lib/live.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const input = await readValidatedBody(event, liveMeetingSchema.parse)

  const id = db.transaction((tx) => {
    const { id } = tx.insert(liveMeetings).values(toLiveMeetingValues(input)).returning({ id: liveMeetings.id }).get()
    recordAudit(tx, { actorUserId: session.user.id, action: 'liveMeeting.create', entityType: 'liveMeeting', entityId: id })
    return id
  })

  setResponseStatus(event, 201)
  return { meeting: presentAdminLiveMeeting(loadLiveMeeting(id)!) }
})
