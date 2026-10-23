// The church's regular services as occurrences on a calendar.
//
// The church types its services into Church details (weekday and time). The
// Google calendar may also hold them, with the real dates: a service moved to
// another hour, or cancelled for a week. This joins the two:
//
//  - A typed service whose name matches a Google calendar event is that event's
//    series. The calendar's dates win, so the home page shows what is really
//    happening.
//  - A typed service the Google calendar does not have is repeated every week
//    from the typed day and time, and listed on the calendar page if its
//    "Show on the calendar" box is ticked.
import { CalendarDate, CalendarDateTime, fromDate, getDayOfWeek, toCalendarDate, toZoned } from '@internationalized/date'
import type { CalendarEvent, CalendarPayload } from '../../shared/calendar.ts'
import { calendarHorizon } from './calendar.ts'
import { addressLines, clock12, serviceShown, weekdayShort, type ServiceShown, type ServiceTime, type SiteView } from '../../shared/site.ts'

// How long a typed service is shown for on the calendar; nobody typed an end.
const SERVICE_MINUTES = 60

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// The weekly occurrences of one typed service, from `now` to the end of the
// calendar's range, in the church's own time zone (so "10:00" stays 10:00 across
// daylight saving).
export const weeklyOccurrences = (service: ServiceTime, timeZone: string, now: Date) => {
  const [hour, minute] = service.time.split(':').map(Number)
  // The church's today, from `now` (not the machine's clock), so it can be tested.
  const first = toCalendarDate(fromDate(now, timeZone))
  const until = calendarHorizon(now, timeZone)
  const found: Array<{ start: Date, end: Date }> = []
  for (let date: CalendarDate = first; ; date = date.add({ days: 1 })) {
    if (getDayOfWeek(date, 'en-US') !== service.weekday) continue
    const start = toZoned(new CalendarDateTime(date.year, date.month, date.day, hour!, minute!), timeZone).toDate()
    if (start >= until) break
    const end = new Date(start.getTime() + SERVICE_MINUTES * 60_000)
    if (end >= now) found.push({ start, end })
  }
  return found
}

// The calendar page: Google's events, plus every ticked typed service that
// Google does not have.
export const withServices = (payload: CalendarPayload, site: SiteView, now = new Date()): CalendarPayload => {
  const location = addressLines(site).join(', ') || null
  const added: CalendarEvent[] = []

  site.serviceTimes.forEach((service, index) => {
    if (!service.onCalendar) return
    if (payload.events.some(event => same(event.title, service.label))) return
    for (const { start, end } of weeklyOccurrences(service, payload.timeZone, now)) {
      added.push({
        id: `service:${index}:${start.toISOString()}`,
        series: `service:${index}`,
        title: service.label,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        location,
        meetUrl: null,
        description: service.note || null,
      })
    }
  })

  if (!added.length) return payload
  const events = [...payload.events, ...added].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
  return { ...payload, events }
}

const inZone = (start: Date, timeZone: string) => {
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(start)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part({ weekday: 'short' }))
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(start)
  return { weekday, clock, date: part({ month: 'short', day: 'numeric' }) }
}

// The home page: each typed service as it is next going to happen. From the
// Google calendar when it has the service (a moved one shows its new day or time
// and the date); from the typed day and time otherwise, or when the calendar
// could not be read (`calendar` null).
export const upcomingServices = (site: SiteView, calendar: CalendarPayload | null, now = new Date()): ServiceShown[] => {
  const timeZone = calendar?.timeZone ?? 'America/Detroit'
  return site.serviceTimes.map((service) => {
    const usual = serviceShown(service)
    const next = calendar?.events.find(event => !event.allDay && same(event.title, service.label) && new Date(event.end) >= now)
    if (!next) return usual

    const at = inZone(new Date(next.start), timeZone)
    const moved = at.weekday !== service.weekday || at.clock !== service.time
    return {
      ...usual,
      day: weekdayShort(at.weekday),
      time: clock12(at.clock),
      changed: moved ? at.date : '',
    }
  })
}
