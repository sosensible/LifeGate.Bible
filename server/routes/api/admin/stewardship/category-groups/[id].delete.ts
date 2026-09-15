// Only an empty group can be removed.
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { deleteGroup, findGroup } from '../../../../../lib/stewardship.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  db.transaction((tx) => {
    const group = findGroup(tx, id)
    deleteGroup(tx, id)
    recordAudit(tx, { actorUserId: session.user.id, action: 'categoryGroup.delete', entityType: 'categoryGroup', entityId: id, note: group.name })
  })
  setResponseStatus(event, 204)
  return null
})
