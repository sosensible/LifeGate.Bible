// Reading the Google Calendar feed. The awkward parts are repeating events, the
// single occurrences that get moved or cancelled out of a series, and the
// calendar's own time zone — so those are what is tested here.
import { describe, expect, it, vi } from 'vitest'
import { parseCalendar } from '../../server/lib/calendar'
import { formatEventTime, groupByDay, groupByMonth } from '../../shared/calendar'

const ZONE = 'America/Detroit'

// A calendar written the way Google writes one: local times with a TZID, a
// VTIMEZONE to resolve them, and overrides carrying the series UID.
const feed = (...events: string[]) => `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-TIMEZONE:America/Detroit
BEGIN:VTIMEZONE
TZID:America/Detroit
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
${events.join('\n')}
END:VCALENDAR`

const weeklyService = `BEGIN:VEVENT
DTSTART;TZID=America/Detroit:20260301T110000
DTEND;TZID=America/Detroit:20260301T120000
RRULE:FREQ=WEEKLY;BYDAY=SU
UID:service@google.com
X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij
DESCRIPTION:Join with Google Meet: https://meet.google.com/abc-defg-hij\\nOr dial: (US) +1 929-282-0936 PIN: 800563586#\\nLearn more about Meet at: https://support.google.com/a/users/answer/9282720
LOCATION:2890 S Park Rd\\, Eau Claire\\, MI 49111
STATUS:CONFIRMED
SUMMARY:Sunday Service
END:VEVENT`

// 15 March moves an hour later and is renamed.
const movedInstance = `BEGIN:VEVENT
DTSTART;TZID=America/Detroit:20260315T120000
DTEND;TZID=America/Detroit:20260315T130000
RECURRENCE-ID;TZID=America/Detroit:20260315T110000
UID:service@google.com
STATUS:CONFIRMED
SUMMARY:Sunday Service (Potluck)
END:VEVENT`

// 22 March is called off.
const cancelledInstance = `BEGIN:VEVENT
DTSTART;TZID=America/Detroit:20260322T110000
DTEND;TZID=America/Detroit:20260322T120000
RECURRENCE-ID;TZID=America/Detroit:20260322T110000
UID:service@google.com
STATUS:CANCELLED
SUMMARY:Sunday Service
END:VEVENT`

const oneOff = `BEGIN:VEVENT
DTSTART;TZID=America/Detroit:20260404T090000
DTEND;TZID=America/Detroit:20260404T103000
UID:breakfast@google.com
STATUS:CONFIRMED
SUMMARY:Easter Breakfast
DESCRIPTION:Bring a dish to share.
END:VEVENT`

// A Sunday morning before any of the fixture events.
const BEFORE = new Date('2026-02-25T12:00:00Z')

describe('reading the calendar feed', () => {
  it('expands a repeating event', () => {
    const events = parseCalendar(feed(weeklyService), BEFORE)
    const services = events.filter(e => e.title.startsWith('Sunday Service'))
    expect(services.length).toBeGreaterThan(40)
    // Every one lands on a Sunday, in the church's zone.
    for (const service of services.slice(0, 10)) {
      const weekday = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'long' }).format(new Date(service.start))
      expect(weekday).toBe('Sunday')
    }
  })

  it('keeps the local time across the daylight-saving change', () => {
    const events = parseCalendar(feed(weeklyService), BEFORE)
    const at = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
    // Detroit moves to EDT on 8 March 2026; the service stays at 11:00 either side.
    const march1 = events.find(e => e.start.startsWith('2026-03-01'))
    const march29 = events.find(e => e.start.startsWith('2026-03-29'))
    expect(at(march1!.start)).toBe('11:00 AM')
    expect(at(march29!.start)).toBe('11:00 AM')
    // Which is a different UTC instant on each side of the change.
    expect(march1!.start).toContain('16:00')
    expect(march29!.start).toContain('15:00')
  })

  it('uses the edited version of a moved occurrence, and only once', () => {
    const events = parseCalendar(feed(weeklyService, movedInstance), BEFORE)
    const onThatDay = events.filter(e => e.start.startsWith('2026-03-15'))
    expect(onThatDay).toHaveLength(1)
    expect(onThatDay[0]!.title).toBe('Sunday Service (Potluck)')
    expect(formatEventTime(onThatDay[0]!, ZONE)).toBe('12:00 PM – 1:00 PM')
  })

  it('drops a cancelled occurrence', () => {
    const events = parseCalendar(feed(weeklyService, cancelledInstance), BEFORE)
    expect(events.filter(e => e.start.startsWith('2026-03-22'))).toHaveLength(0)
    // The surrounding Sundays are untouched.
    expect(events.filter(e => e.start.startsWith('2026-03-15'))).toHaveLength(1)
    expect(events.filter(e => e.start.startsWith('2026-03-29'))).toHaveLength(1)
  })

  it('takes the Meet link off the event and clears Google’s boilerplate', () => {
    const [first] = parseCalendar(feed(weeklyService), BEFORE)
    expect(first!.meetUrl).toBe('https://meet.google.com/abc-defg-hij')
    expect(first!.description).toBeNull()
    expect(first!.location).toBe('2890 S Park Rd, Eau Claire, MI 49111')
  })

  it('keeps a description someone actually wrote', () => {
    const events = parseCalendar(feed(oneOff), BEFORE)
    const breakfast = events.find(e => e.title === 'Easter Breakfast')
    expect(breakfast!.description).toBe('Bring a dish to share.')
    expect(breakfast!.meetUrl).toBeNull()
  })

  it('leaves out anything already finished', () => {
    const after = new Date('2026-04-05T12:00:00Z')
    const events = parseCalendar(feed(oneOff), after)
    expect(events.find(e => e.title === 'Easter Breakfast')).toBeUndefined()
  })

  it('still shows an event that has started but not ended', () => {
    const during = new Date('2026-04-04T14:00:00Z') // 10am Detroit, mid-breakfast
    const events = parseCalendar(feed(oneOff), during)
    expect(events.find(e => e.title === 'Easter Breakfast')).toBeDefined()
  })

  it('sorts by when they start, soonest first', () => {
    const events = parseCalendar(feed(weeklyService, oneOff), BEFORE)
    const starts = events.map(e => e.start)
    expect(starts).toEqual([...starts].sort())
  })

  it('gives each occurrence its own id', () => {
    const events = parseCalendar(feed(weeklyService, oneOff), BEFORE)
    expect(new Set(events.map(e => e.id)).size).toBe(events.length)
  })

  it('refuses something that is not a calendar', () => {
    expect(() => parseCalendar('not a calendar at all')).toThrow()
  })
})

describe('arranging events for the page', () => {
  const events = parseCalendar(feed(weeklyService, oneOff), BEFORE)

  it('groups by month, in order, without losing any', () => {
    const months = groupByMonth(events, ZONE)
    expect(months[0]!.label).toBe('March 2026')
    expect(months.reduce((n, m) => n + m.events.length, 0)).toBe(events.length)
  })

  it('groups by day, so the month grid can mark them', () => {
    const days = groupByDay(events, ZONE)
    expect(days.get('2026-03-01')).toHaveLength(1)
    expect(days.get('2026-04-04')?.[0]!.title).toBe('Easter Breakfast')
    expect(days.has('2026-03-02')).toBe(false)
  })
})

// The caching contract: read once a day, and let an editor force a fresh read.
describe('caching the feed', () => {
  const ics = feed(oneOff)

  const load = async (responses: Array<string | Error>) => {
    vi.resetModules()
    const calls: number[] = []
    let n = 0
    vi.stubGlobal('$fetch', async () => {
      calls.push(++n)
      const answer = responses[Math.min(n - 1, responses.length - 1)]
      if (answer instanceof Error) throw answer
      return answer
    })
    const mod = await import('../../server/lib/calendar')
    return { loadCalendar: mod.loadCalendar, reads: () => calls.length }
  }

  it('reads the feed once, then serves the copy', async () => {
    const { loadCalendar, reads } = await load([ics])
    await loadCalendar()
    await loadCalendar()
    await loadCalendar()
    expect(reads()).toBe(1)
  })

  it('shares one read between callers arriving together', async () => {
    const { loadCalendar, reads } = await load([ics])
    await Promise.all([loadCalendar(), loadCalendar(), loadCalendar()])
    expect(reads()).toBe(1)
  })

  it('reads again when an editor asks for it', async () => {
    const { loadCalendar, reads } = await load([ics])
    await loadCalendar()
    await loadCalendar(true)
    expect(reads()).toBe(2)
  })

  it('keeps serving the last good copy when the feed is down', async () => {
    const { loadCalendar } = await load([ics, new Error('Google is down')])
    const first = await loadCalendar()
    // A day later, the scheduled read fails; members should still see the calendar.
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000)
    const second = await loadCalendar()
    expect(second.events).toEqual(first.events)
    vi.useRealTimers()
  })

  it('tells an editor when their refresh failed, instead of reporting success', async () => {
    const { loadCalendar } = await load([ics, new Error('Google is down')])
    await loadCalendar()
    await expect(loadCalendar(true)).rejects.toThrow('Google is down')
  })

  it('refuses a first read that fails, having nothing to fall back on', async () => {
    const { loadCalendar } = await load([new Error('Google is down')])
    await expect(loadCalendar()).rejects.toThrow('Google is down')
  })
})
