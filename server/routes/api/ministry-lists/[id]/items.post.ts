// Add an item. Leaders add anything; members add to a plain checklist.
import { itemInputSchema } from '../../../../../shared/ministry-lists.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { addItem } from '../../../../lib/ministry-lists.ts'
import { announceTask } from '../../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireListViewer(event)
  const listId = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBody(event, itemInputSchema.parse)

  const result = db.transaction((tx) => {
    const added = addItem(tx, viewer, listId, input)
    if (added.assigned) recordAudit(tx, { actorUserId: session.user.id, action: 'ministryList.assign', entityType: 'ministryList', entityId: listId })
    return added
  })
  const told = result.assigned ? announceTask(result.id, viewer.personId) : null
  setResponseStatus(event, 201)
  return { id: result.id, notice: told?.notice ?? null }
})
