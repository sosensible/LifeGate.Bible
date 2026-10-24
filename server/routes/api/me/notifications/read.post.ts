// Mark some, or all, of the signed-in person's notifications read.
import { readInputSchema } from '../../../../../shared/notifications.ts'
import { db } from '../../../../lib/db.ts'
import { markRead } from '../../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { session } = await requireNotifyViewer(event)
  const input = await readValidatedBody(event, readInputSchema.parse)
  return { marked: db.transaction(tx => markRead(tx, session.user.id, input)) }
})
