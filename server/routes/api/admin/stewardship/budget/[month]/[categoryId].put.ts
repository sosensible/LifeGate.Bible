// Set how much a category is funded in a month.
import { fundingSchema } from '../../../../../../../shared/stewardship.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { monthView, setFunding } from '../../../../../../lib/budget.ts'
import { db } from '../../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const month = monthParam(event)
  const categoryId = getRouterParam(event, 'categoryId')!
  const { fundedCents } = await readValidatedBody(event, fundingSchema.parse)

  db.transaction((tx) => {
    setFunding(tx, categoryId, month, fundedCents)
    // The month, not the amount: admins read the audit log.
    recordAudit(tx, { actorUserId: session.user.id, action: 'budget.fund', entityType: 'category', entityId: categoryId, note: month })
  })
  return { budget: monthView(month) }
})
