// Edit an item, or give a task to someone (or take it back).
import { itemPatchSchema } from '../../../../../../shared/ministry-lists.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { updateItem } from '../../../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireListViewer(event)
  const listId = getRouterParam(event, 'id') ?? ''
  const itemId = getRouterParam(event, 'item') ?? ''
  const patch = await readValidatedBody(event, itemPatchSchema.parse)

  return db.transaction((tx) => {
    const result = updateItem(tx, viewer, listId, itemId, patch)
    if (result.assigned) recordAudit(tx, { actorUserId: session.user.id, action: 'ministryList.assign', entityType: 'ministryList', entityId: listId })
    return result
  })
})
