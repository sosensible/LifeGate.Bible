// The church's regular services: the days and times typed into Church details,
// joined with the Google calendar's real dates for the home page and the church
// calendar. Pure functions, no database.
import { describe, expect, it } from 'vitest'
import type { CalendarEvent, CalendarPayload } from '../../shared/calendar'
import { SITE_DEFAULTS, type ServiceTime, type SiteView } from '../../shared/site'
import { upcomingServices, weeklyOccurrences, withServices } from '../../server/lib/services'

const TZ = 'America/Detroit'

const service = (over: Partial<ServiceTime> = {}): ServiceTime => ({ weekday: 0, time: '11:00', label: 'Sunday Service', note: 'Main', onCalendar: true, ...over })
const site = (serviceTimes: ServiceTime[], over: Partial<SiteView> = {}): SiteView => ({ ...SITE_DEFAULTS, serviceTimes, ...over })

// Thursday 22 Oct 2026, noon in Detroit (EDT, UTC-4).
const NOW = new Date('2026-10-22T16:00:00Z')

const event = (title: string, start: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `${title}:${start}`, series: null, title, start, end: new Date(new Date(start).getTime() + 3_600_000).toISOString(), allDay: false, location: null, meetUrl: null, description: null, ...over,
})
const payload = (events: CalendarEvent[]): CalendarPayload => ({ events, horizon: '2027-02-01T05:00:00.000Z', fetchedAt: NOW.toISOString(), timeZone: TZ })

describe('a typed service repeated every week', () => {
  it('lands on the typed weekday and time in the church’s time zone', () => {
    const [first, second] = weeklyOccurrences(service(), TZ, NOW)
    expect(first!.start.toISOString()).toBe('2026-10-25T15:00:00.000Z') // 11:00 EDT
    expect(second!.start.toISOString()).toBe('2026-11-01T16:00:00.000Z') // 11:00 EST: the clocks went back that morning
  })

  it('does not shift an hour when daylight saving starts or ends', () => {
    for (const { start } of weeklyOccurrences(service({ weekday: 3, time: '18:30' }), TZ, NOW)) {
      const local = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(start)
      expect(local).toBe('18:30')
    }
  })

  it('runs to the end of January from late October, one a week, and no further', () => {
    const found = weeklyOccurrences(service(), TZ, NOW)
    expect(found).toHaveLength(15) // 25 Oct ... 31 Jan
    expect(found.at(-1)!.start.toISOString()).toBe('2027-01-31T16:00:00.000Z')
  })

  it('leaves out a service that has already finished today', () => {
    const afterwards = new Date('2026-10-25T17:30:00Z') // 13:30 EDT on the Sunday
    expect(weeklyOccurrences(service(), TZ, afterwards)[0]!.start.toISOString()).toBe('2026-11-01T16:00:00.000Z')
    const during = new Date('2026-10-25T15:30:00Z') // 11:30: under way
    expect(weeklyOccurrences(service(), TZ, during)[0]!.start.toISOString()).toBe('2026-10-25T15:00:00.000Z')
  })
})

describe('the church calendar page', () => {
  it('adds a ticked service the Google calendar does not have', () => {
    const merged = withServices(payload([event('Potluck', '2026-10-28T22:00:00Z')]), site([service()]), NOW)
    const added = merged.events.filter(e => e.title === 'Sunday Service')
    expect(added).toHaveLength(15)
    expect(new Set(added.map(e => e.series))).toEqual(new Set(['service:0']))
    expect(added[0]).toMatchObject({ start: '2026-10-25T15:00:00.000Z', allDay: false, description: 'Main' })
    expect(merged.events.map(e => e.start)).toEqual([...merged.events.map(e => e.start)].sort())
    expect(merged.events.some(e => e.title === 'Potluck')).toBe(true)
  })

  it('adds nothing for a service that is not ticked', () => {
    const base = payload([])
    expect(withServices(base, site([service({ onCalendar: false })]), NOW)).toBe(base)
  })

  // Otherwise every Sunday would be listed twice.
  it('leaves a service alone when the Google calendar already has it, whatever the case', () => {
    const google = payload([event('sunday service', '2026-10-25T14:00:00Z')])
    expect(withServices(google, site([service()]), NOW).events).toHaveLength(1)
  })

  it('gives each generated occurrence its own id, and names the church’s address as the place', () => {
    const merged = withServices(payload([]), site([service(), service({ weekday: 3, label: 'Prayer' })], { street: '1 Main St', city: 'Town', region: 'MI', postalCode: '49111' }), NOW)
    expect(new Set(merged.events.map(e => e.id)).size).toBe(merged.events.length)
    expect(merged.events[0]!.location).toBe('1 Main St, Town, MI 49111')
  })
})

describe('the home page', () => {
  it('shows the usual day and time when the calendar is not available', () => {
    expect(upcomingServices(site([service()]), null, NOW)).toEqual([{ label: 'Sunday Service', note: 'Main', day: 'Sun', time: '11:00 AM', changed: '' }])
  })

  it('shows the usual day and time when the calendar has no such service', () => {
    expect(upcomingServices(site([service()]), payload([event('Potluck', '2026-10-28T22:00:00Z')]), NOW)[0]).toMatchObject({ day: 'Sun', time: '11:00 AM', changed: '' })
  })

  it('follows the calendar to the next service, saying nothing when it is as usual', () => {
    const google = payload([event('Sunday Service', '2026-10-25T15:00:00Z'), event('Sunday Service', '2026-11-01T16:00:00Z')])
    expect(upcomingServices(site([service()]), google, NOW)[0]).toMatchObject({ day: 'Sun', time: '11:00 AM', changed: '' })
  })

  it('shows a moved service at its new time, with the date', () => {
    const google = payload([event('Sunday Service', '2026-10-25T14:00:00Z')]) // 10:00 EDT
    expect(upcomingServices(site([service()]), google, NOW)[0]).toMatchObject({ day: 'Sun', time: '10:00 AM', changed: 'Oct 25' })
  })

  it('shows a service moved to another day on that day', () => {
    const google = payload([event('Sunday Service', '2026-10-24T15:00:00Z')]) // Saturday
    expect(upcomingServices(site([service()]), google, NOW)[0]).toMatchObject({ day: 'Sat', time: '11:00 AM', changed: 'Oct 24' })
  })

  // A cancelled occurrence is simply absent from the feed, so the next one is the following week.
  it('skips a cancelled week and shows the next', () => {
    const google = payload([event('Sunday Service', '2026-11-01T16:00:00Z')])
    expect(upcomingServices(site([service()]), google, NOW)[0]).toMatchObject({ day: 'Sun', time: '11:00 AM', changed: '' })
  })

  it('ignores a service that has already ended', () => {
    // Last week's was moved to 10:00; that is over, and says nothing about this week's.
    const google = payload([event('Sunday Service', '2026-10-18T14:00:00Z'), event('Sunday Service', '2026-10-25T15:00:00Z')])
    expect(upcomingServices(site([service()]), google, NOW)[0]).toMatchObject({ time: '11:00 AM', changed: '' })
  })

  it('keeps the church’s order and shows nothing when none are typed', () => {
    expect(upcomingServices(site([service({ label: 'B' }), service({ label: 'A' })]), null, NOW).map(s => s.label)).toEqual(['B', 'A'])
    expect(upcomingServices(site([]), null, NOW)).toEqual([])
  })
})
