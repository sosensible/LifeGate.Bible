import { countsQuerySchema } from '../../../../../../shared/giving.ts'
import { loadCounts } from '../../../../../lib/giving.ts'

// Counters see only open counts, without totals.
export default defineEventHandler(async (event) => {
  const viewer = await getGivingViewer(event)
  const { year } = await getValidatedQuery(event, countsQuerySchema.parse)
  return {
    counts: loadCounts({ openOnly: !viewer.canView, withTotals: viewer.canView, year: viewer.canView ? year : undefined }),
    canView: viewer.canView,
    canManage: viewer.canManage,
  }
})
