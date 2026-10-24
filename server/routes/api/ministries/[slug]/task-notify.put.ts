// A ministry's leaders choose how a person is told when they are given a task here.
import { taskNotifyInputSchema } from '../../../../../shared/notifications.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { ministryIdOf, setMinistryTaskNotify } from '../../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireNotifyViewer(event)
  const ministryId = ministryIdOf(getRouterParam(event, 'slug') ?? '')
  const { taskNotify } = await readValidatedBody(event, taskNotifyInputSchema.parse)

  db.transaction((tx) => {
    setMinistryTaskNotify(tx, viewer, ministryId, taskNotify)
    recordAudit(tx, { actorUserId: session.user.id, action: 'notification.taskNotify', entityType: 'ministry', entityId: ministryId, fields: ['taskNotify'] })
  })
  return { taskNotify }
})
