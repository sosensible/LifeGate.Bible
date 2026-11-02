// The people who may be named as having counted an offering: those allowed to enter gifts.
import { listCounters } from '../../../../lib/counters.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { giving: ['record'] })
  return { counters: listCounters() }
})
