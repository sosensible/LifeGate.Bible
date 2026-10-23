import { db } from '../../../../../lib/db.ts'
import { deleteItem } from '../../../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireListViewer(event)
  const listId = getRouterParam(event, 'id') ?? ''
  const itemId = getRouterParam(event, 'item') ?? ''
  db.transaction(tx => deleteItem(tx, viewer, listId, itemId))
  setResponseStatus(event, 204)
  return null
})
