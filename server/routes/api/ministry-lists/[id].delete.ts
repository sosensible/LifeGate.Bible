// Delete a list, its items and its history.
import { recordAudit } from '../../../lib/audit.ts'
import { db } from '../../../lib/db.ts'
import { deleteList } from '../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireListViewer(event)
  const id = getRouterParam(event, 'id') ?? ''
  db.transaction((tx) => {
    deleteList(tx, viewer, id)
    recordAudit(tx, { actorUserId: session.user.id, action: 'ministryList.delete', entityType: 'ministryList', entityId: id })
  })
  setResponseStatus(event, 204)
  return null
})
