// Put a list's items in a new order.
import { orderSchema } from '../../../../../../shared/ministry-lists.ts'
import { db } from '../../../../../lib/db.ts'
import { reorderItems } from '../../../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireListViewer(event)
  const listId = getRouterParam(event, 'id') ?? ''
  const { ids } = await readValidatedBody(event, orderSchema.parse)
  db.transaction(tx => reorderItems(tx, viewer, listId, ids))
  setResponseStatus(event, 204)
  return null
})
