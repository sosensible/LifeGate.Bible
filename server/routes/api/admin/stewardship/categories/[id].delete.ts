// Only a category that was never funded or used; otherwise archive it.
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { deleteCategory } from '../../../../../lib/stewardship.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  db.transaction((tx) => {
    const category = deleteCategory(tx, id)
    recordAudit(tx, { actorUserId: session.user.id, action: 'category.delete', entityType: 'category', entityId: id, note: category.name })
  })
  setResponseStatus(event, 204)
  return null
})
