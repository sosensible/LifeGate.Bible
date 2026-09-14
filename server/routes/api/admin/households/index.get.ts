import { loadHouseholds } from '../../../../lib/households.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { people: ['update'] })
  return { households: loadHouseholds() }
})
