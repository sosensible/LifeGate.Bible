// The church calendar for the members area. Served from the daily cache, so a
// page load does not reach Google.
import { loadCalendar } from '../../lib/calendar.ts'
import type { CalendarPayload } from '../../../shared/calendar.ts'

export default defineEventHandler(async (event): Promise<CalendarPayload> => {
  await requirePermission(event, { memberArea: ['view'] })
  return loadCalendar()
})
