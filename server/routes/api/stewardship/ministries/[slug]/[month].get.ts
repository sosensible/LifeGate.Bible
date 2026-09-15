import { ministryBudgetView } from '../../../../../lib/stewardship-access.ts'

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const month = monthParam(event)
  const seesAll = await hasPermission(session.user.id, { stewardship: ['view'] })
  return { budget: ministryBudgetView(getRouterParam(event, 'slug')!, month, { userId: session.user.id, seesAll }) }
})
