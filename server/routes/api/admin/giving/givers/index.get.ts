import { loadGivers } from '../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { giving: ['view'] })
  const year = yearQuery(event)
  return { year, givers: loadGivers(year) }
})
