import { loadPlans } from '../../../../../lib/plans.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { stewardship: ['view'] })
  return { plans: loadPlans() }
})
