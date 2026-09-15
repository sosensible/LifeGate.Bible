// Save a category's plan.
import { planSchema } from '../../../../../../shared/stewardship.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadPlans, setPlan } from '../../../../../lib/plans.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const categoryId = getRouterParam(event, 'categoryId')!
  const input = await readValidatedBody(event, planSchema.parse)

  const { switchedRollover } = db.transaction((tx) => {
    const result = setPlan(tx, categoryId, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'plan.set', entityType: 'category', entityId: categoryId })
    if (result.switchedRollover) {
      recordAudit(tx, { actorUserId: session.user.id, action: 'category.update', entityType: 'category', entityId: categoryId, fields: ['rollover'] })
    }
    return result
  })
  return { plan: loadPlans().find(plan => plan.categoryId === categoryId), switchedRollover }
})
