// Ministry budgets the signed-in person can see: those granted to ministries
// they serve in, or every ministry with a grant for the Treasurer and Finance Committee.
import { ministryBudgetsFor } from '../../../../lib/stewardship-access.ts'

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const seesAll = await hasPermission(session.user.id, { stewardship: ['view'] })
  return { ministries: ministryBudgetsFor(session.user.id, { seesAll }) }
})
