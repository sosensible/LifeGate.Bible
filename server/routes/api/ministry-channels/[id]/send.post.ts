// Send a message to a channel: a ministry's leaders to their ministry, or a chosen
// announcer to the whole church. The audit trail records who sent it, where, and to
// how many, never the words.
import { sendInputSchema } from '../../../../../shared/notifications.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { sendToChannel } from '../../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireNotifyViewer(event)
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBody(event, sendInputSchema.parse)

  const result = db.transaction((tx) => {
    const sent = sendToChannel(tx, viewer, id, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'notification.send', entityType: 'notificationChannel', entityId: id, note: `Reached ${sent.recipients} ${sent.recipients === 1 ? 'person' : 'people'}` })
    return sent
  })
  setResponseStatus(event, 201)
  return result
})
