// Fund what plans need this month. `dryRun` returns the preview without saving;
// `categoryIds` limits it (e.g. one row's Fund button).
import { z } from 'zod'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { monthView } from '../../../../../../lib/budget.ts'
import { db } from '../../../../../../lib/db.ts'
import { fundPlans } from '../../../../../../lib/plans.ts'

const bodySchema = z.object({
  dryRun: z.boolean().default(false),
  categoryIds: z.array(z.string().min(1)).max(500).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const month = monthParam(event)
  const { dryRun, categoryIds } = await readValidatedBody(event, bodySchema.parse)

  const result = db.transaction((tx) => {
    const result = fundPlans(tx, month, { dryRun, categoryIds })
    if (!dryRun && result.totalCents > 0) {
      recordAudit(tx, { actorUserId: session.user.id, action: 'budget.fundPlans', entityType: 'budget', entityId: null, note: month })
    }
    return result
  })
  return dryRun ? { result } : { result, budget: monthView(month) }
})
