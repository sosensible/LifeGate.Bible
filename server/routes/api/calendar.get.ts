// The church calendar for the members area. Served from the daily cache, so a
// page load does not reach Google.
import { loadCalendar } from '../../lib/calendar.ts'
import { withServices } from '../../lib/services.ts'
import { loadSite } from '../../lib/site.ts'
import type { CalendarPayload } from '../../../shared/calendar.ts'

export default defineEventHandler(async (event): Promise<CalendarPayload> => {
  await requirePermission(event, { memberArea: ['view'] })
  // Google's events, plus the services typed into Church details that are ticked
  // "on the calendar" and that Google does not already have.
  return withServices(await loadCalendar(), loadSite())
})
