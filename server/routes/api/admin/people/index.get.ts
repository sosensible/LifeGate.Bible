import { loadPeople, presentForAdmin } from '../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { people: ['update'] })
  return { people: loadPeople().map(presentForAdmin) }
})
