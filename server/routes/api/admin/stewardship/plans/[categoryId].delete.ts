import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { deletePlan } from '../../../../../lib/plans.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const categoryId = getRouterParam(event, 'categoryId')!
  db.transaction((tx) => {
    if (deletePlan(tx, categoryId)) {
      recordAudit(tx, { actorUserId: session.user.id, action: 'plan.remove', entityType: 'category', entityId: categoryId })
    }
  })
  setResponseStatus(event, 204)
  return null
})
