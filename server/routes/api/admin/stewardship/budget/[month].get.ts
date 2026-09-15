import { monthView } from '../../../../../lib/budget.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { stewardship: ['view'] })
  return { budget: monthView(monthParam(event)) }
})
