import { loadGiver } from '../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { giving: ['view'] })
  return { giver: loadGiver(getRouterParam(event, 'id')!, yearQuery(event)) }
})
