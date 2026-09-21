// The church calendar, read from Google Calendar's public .ics feed.
//
// The feed needs no API key or stored secret, which is why it is preferred over
// the Calendar API. Reading it is the awkward part: services repeat by RRULE,
// single occurrences get moved or cancelled one at a time (RECURRENCE-ID), and
// times carry the calendar's own VTIMEZONE. ical.js is Mozilla's reference
// implementation and handles all three, so none of it is hand-rolled here.
//
// The feed is read at most once a day, on the first request after the cache
// goes stale; an editor can force a re-read from the Calendar page. The cache
// lives in this process, so a restart simply causes the next request to fetch.
import ICAL from 'ical.js'
import type { CalendarEvent, CalendarPayload } from '../../shared/calendar.ts'
import { churchTimeZone } from './live.ts'

const FEED_ID = () => process.env.CHURCH_CALENDAR_ID
  || 'c_baaa4ccb373fea22acd9baa101b3aa2fc108c2fa04f02444c491f6332f7c6b4d@group.calendar.google.com'

const feedUrl = () =>
  `https://calendar.google.com/calendar/ical/${encodeURIComponent(FEED_ID())}/public/basic.ics`

// How far ahead to expand repeating events. A year covers anything the month
// view can page to, and the cap stops a daily rule from running away.
const HORIZON_DAYS = 365
const MAX_OCCURRENCES = 600
const MAX_AGE_MS = 24 * 60 * 60 * 1000

// Google pads the description with its own Meet instructions. The link is on
// the event as X-GOOGLE-CONFERENCE, so the boilerplate is dropped and only what
// a person actually typed is kept.
const MEET_BOILERPLATE = /Join with Google Meet:[\s\S]*?(?:answer\/\d+|$)/gi

const cleanDescription = (raw: string | null): string | null => {
  if (!raw) return null
  const text = raw
    .replace(MEET_BOILERPLATE, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s*\n\s*\n\s*/g, '\n')
    .trim()
  return text || null
}

const meetUrlOf = (component: ICAL.Component, description: string | null): string | null => {
  const conference = component.getFirstPropertyValue('x-google-conference')
  if (typeof conference === 'string' && conference) return conference
  const found = description?.match(/https:\/\/meet\.google\.com\/[a-z-]+/i)
  return found ? found[0] : null
}

const text = (component: ICAL.Component, name: string): string | null => {
  const value = component.getFirstPropertyValue(name)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const parseCalendar = (ics: string, now = new Date()): CalendarEvent[] => {
  const root = new ICAL.Component(ICAL.parse(ics))

  // The feed carries its own time-zone definitions; without registering them,
  // a local time like 11:00 would be read as UTC.
  for (const vtimezone of root.getAllSubcomponents('vtimezone')) {
    const tzid = vtimezone.getFirstPropertyValue('tzid')
    // Registering the component itself lets ical.js take the id from it.
    if (typeof tzid === 'string' && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(vtimezone)
    }
  }

  // A moved or cancelled single occurrence arrives as its own VEVENT sharing
  // the series UID. Attaching it to the series makes the iterator report the
  // change, instead of the day appearing twice.
  const series = new Map<string, ICAL.Event>()
  const exceptions: ICAL.Event[] = []
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent)
    if (event.isRecurrenceException()) exceptions.push(event)
    else if (event.uid) series.set(event.uid, event)
  }
  for (const exception of exceptions) {
    series.get(exception.uid)?.relateException(exception.component)
  }

  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000)
  const events: CalendarEvent[] = []

  const add = (event: ICAL.Event, source: ICAL.Event, start: Date, end: Date) => {
    if (text(source.component, 'status') === 'CANCELLED') return
    const description = cleanDescription(text(source.component, 'description'))
    events.push({
      id: `${event.uid}:${start.toISOString()}`,
      title: source.summary?.trim() || 'Untitled event',
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: source.startDate?.isDate === true,
      location: text(source.component, 'location'),
      meetUrl: meetUrlOf(source.component, text(source.component, 'description')),
      description,
    })
  }

  for (const event of series.values()) {
    if (!event.startDate) continue

    if (!event.isRecurring()) {
      // An event already under way still counts as upcoming until it ends.
      const end = event.endDate?.toJSDate() ?? event.startDate.toJSDate()
      if (end >= now && event.startDate.toJSDate() <= horizon) {
        add(event, event, event.startDate.toJSDate(), end)
      }
      continue
    }

    const iterator = event.iterator()
    let next: ICAL.Time | null
    let seen = 0
    while ((next = iterator.next()) && seen < MAX_OCCURRENCES) {
      const startsAt = next.toJSDate()
      if (startsAt > horizon) break
      seen++
      const occurrence = event.getOccurrenceDetails(next)
      const end = occurrence.endDate.toJSDate()
      if (end < now) continue
      add(event, occurrence.item, occurrence.startDate.toJSDate(), end)
    }
  }

  return events.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
}

let cache: { payload: CalendarPayload, at: number } | null = null
let inFlight: Promise<CalendarPayload> | null = null

const fetchCalendar = async (): Promise<CalendarPayload> => {
  const ics = await $fetch<string>(feedUrl(), { responseType: 'text', timeout: 15_000 })
  if (typeof ics !== 'string' || !ics.includes('BEGIN:VCALENDAR')) {
    throw new Error('The calendar feed did not return a calendar')
  }
  return {
    events: parseCalendar(ics),
    fetchedAt: new Date().toISOString(),
    timeZone: churchTimeZone(),
  }
}

// Read once a day. `force` is the editor's refresh button. Concurrent callers
// share one request, so a burst of page loads cannot stampede the feed.
export const loadCalendar = async (force = false): Promise<CalendarPayload> => {
  if (force) return read(true)
  if (cache && Date.now() - cache.at < MAX_AGE_MS) return cache.payload
  if (inFlight) return inFlight

  // Only an ordinary read is registered as the shared one: a forced read runs
  // on its own, so it cannot be handed a page load's result or cut that
  // request short when it finishes first.
  const work = read(false).finally(() => { inFlight = null })
  inFlight = work
  return work
}

const read = (force: boolean): Promise<CalendarPayload> =>
  fetchCalendar()
    .then((payload) => {
      cache = { payload, at: Date.now() }
      return payload
    })
    .catch((error) => {
      // For the daily read a stale calendar beats an error page, so the last
      // good copy stands in. A refresh someone pressed must not do that: they
      // would be told it worked, and go on believing the site had caught up.
      if (cache && !force) return cache.payload
      throw error
    })
