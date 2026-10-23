// A leader has seen that a task lost its assignee.
import { db } from '../../../../../../lib/db.ts'
import { dismissUnassignedNotice } from '../../../../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireListViewer(event)
  const listId = getRouterParam(event, 'id') ?? ''
  const itemId = getRouterParam(event, 'item') ?? ''
  db.transaction(tx => dismissUnassignedNotice(tx, viewer, listId, itemId))
  setResponseStatus(event, 204)
  return null
})
