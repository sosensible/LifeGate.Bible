// The services the home page lists, public: each typed service as it is next
// going to happen, taking the Google calendar's dates where it has them. The
// calendar is read at most once a day (see server/lib/calendar.ts); if it cannot
// be read the church's usual days and times are shown.
import { loadCalendar } from '../../../lib/calendar.ts'
import { upcomingServices } from '../../../lib/services.ts'
import { loadSite } from '../../../lib/site.ts'

export default defineEventHandler(async () => {
  const site = loadSite()
  if (!site.serviceTimes.length) return []
  const calendar = await loadCalendar().catch(() => null)
  return upcomingServices(site, calendar)
})
