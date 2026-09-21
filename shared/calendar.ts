// The church calendar, read from the Google Calendar feed and shown on
// /calendar. Times are sent as instants (ISO with an offset) and always
// displayed in the church's own time zone, so a member travelling out of state
// still reads the service time as the people in the building will.

export interface CalendarEvent {
  // Stable per occurrence: the event's UID and the instant it starts, so a
  // weekly service gives a different id each Sunday.
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  location: string | null
  // Google puts the Meet link on the event; a meeting is joined by following
  // it, never by embedding it.
  meetUrl: string | null
  description: string | null
}

export interface CalendarPayload {
  events: CalendarEvent[]
  // When the feed was last read, so the page can say how fresh it is.
  fetchedAt: string
  timeZone: string
}

export interface CalendarMonth {
  key: string
  label: string
  events: CalendarEvent[]
}

const monthKey = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).format(new Date(iso))

export const monthLabel = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, month: 'long', year: 'numeric' }).format(new Date(iso))

// "2026-09-27" in the church's time zone — the key a day is looked up by, and
// what the month grid matches against.
export const dayKey = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

export const groupByMonth = (events: CalendarEvent[], timeZone: string): CalendarMonth[] => {
  const months = new Map<string, CalendarMonth>()
  for (const event of events) {
    const key = monthKey(event.start, timeZone)
    let month = months.get(key)
    if (!month) months.set(key, month = { key, label: monthLabel(event.start, timeZone), events: [] })
    month.events.push(event)
  }
  return [...months.values()]
}

export const groupByDay = (events: CalendarEvent[], timeZone: string) => {
  const days = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const key = dayKey(event.start, timeZone)
    const list = days.get(key)
    if (list) list.push(event)
    else days.set(key, [event])
  }
  return days
}

// "11:00 AM – 12:00 PM", or "11:00 AM" when the end adds nothing.
export const formatEventTime = (event: CalendarEvent, timeZone: string) => {
  if (event.allDay) return 'All day'
  const at = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  const start = at(event.start)
  const end = at(event.end)
  return start === end ? start : `${start} – ${end}`
}

export const formatEventDay = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(iso))
