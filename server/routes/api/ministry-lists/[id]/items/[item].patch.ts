// Edit an item, or give a task to someone (or take it back).
import { itemPatchSchema } from '../../../../../../shared/ministry-lists.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { updateItem } from '../../../../../lib/ministry-lists.ts'
import { announceTask } from '../../../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireListViewer(event)
  const listId = getRouterParam(event, 'id') ?? ''
  const itemId = getRouterParam(event, 'item') ?? ''
  const patch = await readValidatedBody(event, itemPatchSchema.parse)

  const result = db.transaction((tx) => {
    const changed = updateItem(tx, viewer, listId, itemId, patch)
    if (changed.assigned) recordAudit(tx, { actorUserId: session.user.id, action: 'ministryList.assign', entityType: 'ministryList', entityId: listId })
    return changed
  })
  // Once it is saved: tell the person, as the ministry or the list chose.
  // The leader is told if the person cannot be told.
  const told = result.assigned ? announceTask(itemId, viewer.personId) : null
  return { ...result, notice: told?.notice ?? null }
})
