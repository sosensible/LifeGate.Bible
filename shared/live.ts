// Live meetings: scheduled times to join a meeting as it happens, on Google Meet
// (opens in a new tab) or YouTube Live (plays on the Teaching page). Nothing is
// shown outside a scheduled time, so a service need not be live and a live
// meeting need not be a service.
//
// Dates are YYYY-MM-DD and times HH:MM on the church's calendar and clock; the
// time zone is passed in (CHURCH_TIME_ZONE on the server).
import { fromDate, parseDateTime, toCalendarDate, toZoned } from '@internationalized/date'
import { z } from 'zod'
import { parseYouTubeChannelId, parseYouTubeId, youTubeChannelUrl, youTubeWatchUrl } from './youtube.ts'

export const LIVE_KINDS = ['meet', 'youtube'] as const
export type LiveKind = typeof LIVE_KINDS[number]
export const LIVE_REPEATS = ['once', 'weekly'] as const
export type LiveRepeat = typeof LIVE_REPEATS[number]

export const LIVE_KIND_LABELS: Record<LiveKind, string> = { meet: 'Google Meet', youtube: 'YouTube Live' }

// The Join button appears this long before a meeting starts.
export const LIVE_OPENS_EARLY_MINUTES = 15

export const parseMeetLink = (input: string): string | null => {
  const value = input.trim()
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  }
  catch {
    return null
  }
  if (url.hostname.toLowerCase() !== 'meet.google.com' || url.pathname.length < 2) return null
  return `https://meet.google.com${url.pathname}${url.search}`
}

// A live video, or a channel, which plays whatever is live on it: the same link
// works every week.
export type YouTubeLive = { videoId: string } | { channelId: string }

export const parseYouTubeLive = (input: string): YouTubeLive | null => {
  const videoId = parseYouTubeId(input)
  if (videoId) return { videoId }
  const channelId = parseYouTubeChannelId(input)
  return channelId ? { channelId } : null
}

// The link as stored, or null if it is not a link of that kind.
export const normalizeLiveLink = (kind: LiveKind, input: string): string | null => {
  if (kind === 'meet') return parseMeetLink(input)
  const youtube = parseYouTubeLive(input)
  if (!youtube) return null
  return 'videoId' in youtube ? youTubeWatchUrl(youtube.videoId) : youTubeChannelUrl(youtube.channelId)
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export const liveMeetingSchema = z.object({
  title: z.string().trim().min(1, 'Enter a name').max(120),
  kind: z.enum(LIVE_KINDS),
  link: z.string().trim().min(1, 'Paste the link').max(300),
  visibility: z.enum(['public', 'members']),
  repeat: z.enum(LIVE_REPEATS),
  startsOn: z.iso.date('Choose a date'),
  // Weekly only: the last date it may happen, or null to keep going.
  endsOn: z.iso.date().nullable(),
  startTime: z.string().regex(TIME, 'Choose a start time'),
  endTime: z.string().regex(TIME, 'Choose an end time'),
  // Weekly only: dates it does not happen.
  skippedDates: z.array(z.iso.date()).max(500),
}).superRefine((value, ctx) => {
  if (normalizeLiveLink(value.kind, value.link) === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['link'],
      message: value.kind === 'meet'
        ? 'Paste a Google Meet link, e.g. https://meet.google.com/abc-defg-hij'
        : 'Paste a YouTube live video link, or a channel link (youtube.com/channel/UC…)',
    })
  }
  if (value.endTime <= value.startTime) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End after it starts' })
  if (value.repeat === 'weekly' && value.endsOn && value.endsOn < value.startsOn) {
    ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'The last date is before the first' })
  }
})

export type LiveMeetingInput = z.infer<typeof liveMeetingSchema>

export type LiveSchedule = Pick<LiveMeetingInput, 'repeat' | 'startsOn' | 'endsOn' | 'startTime' | 'endTime' | 'skippedDates'>

const DAY_MS = 24 * 60 * 60 * 1000
const dayNumber = (date: string) => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day) / DAY_MS
}
export const addDays = (date: string, days: number) => new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10)

// Up to `count` scheduled dates on or after `from`, in order, skipped ones included.
export const scheduleDates = (schedule: LiveSchedule, from: string, count: number): string[] => {
  if (schedule.repeat === 'once') return schedule.startsOn >= from && count > 0 ? [schedule.startsOn] : []
  const dates: string[] = []
  for (let n = Math.max(0, Math.ceil((dayNumber(from) - dayNumber(schedule.startsOn)) / 7)); dates.length < count; n++) {
    const date = addDays(schedule.startsOn, n * 7)
    if (schedule.endsOn && date > schedule.endsOn) break
    dates.push(date)
  }
  return dates
}

export const happensOn = (schedule: LiveSchedule, date: string) =>
  scheduleDates(schedule, date, 1)[0] === date && !(schedule.repeat === 'weekly' && schedule.skippedDates.includes(date))

// The church's calendar date at an instant.
export const churchDate = (at: Date, timeZone: string) => toCalendarDate(fromDate(at, timeZone)).toString()

// A church date and clock time as an instant.
export const churchInstant = (date: string, time: string, timeZone: string) => toZoned(parseDateTime(`${date}T${time}`), timeZone).toDate()

export interface Occurrence {
  date: string
  startsAt: Date
  endsAt: Date
}

export const occurrenceOn = (schedule: LiveSchedule, date: string, timeZone: string): Occurrence => ({
  date,
  startsAt: churchInstant(date, schedule.startTime, timeZone),
  endsAt: churchInstant(date, schedule.endTime, timeZone),
})

const EARLY_MS = LIVE_OPENS_EARLY_MINUTES * 60 * 1000

// The occurrence being shown at `now`: from shortly before it starts until it ends.
export const showingOccurrence = (schedule: LiveSchedule, now: Date, timeZone: string): Occurrence | null => {
  const dates = new Set([churchDate(now, timeZone), churchDate(new Date(now.getTime() + EARLY_MS), timeZone)])
  for (const date of dates) {
    if (!happensOn(schedule, date)) continue
    const occurrence = occurrenceOn(schedule, date, timeZone)
    if (now.getTime() >= occurrence.startsAt.getTime() - EARLY_MS && now < occurrence.endsAt) return occurrence
  }
  return null
}

// The next occurrence that has not ended, skipping skipped dates.
export const nextOccurrence = (schedule: LiveSchedule, now: Date, timeZone: string): Occurrence | null => {
  for (const date of scheduleDates(schedule, churchDate(now, timeZone), 520)) {
    if (!happensOn(schedule, date)) continue
    const occurrence = occurrenceOn(schedule, date, timeZone)
    if (occurrence.endsAt > now) return occurrence
  }
  return null
}

// What the Teaching and home pages receive for a meeting being shown now.
// `title`, `link` and `youtube` are null when the viewer may not join: a
// members-only meeting, for anyone who is not a signed-in member.
export interface LiveNowView {
  id: string
  title: string | null
  kind: LiveKind
  visibility: 'public' | 'members'
  startsAt: string
  endsAt: string
  link: string | null
  youtube: YouTubeLive | null
}

export interface LiveNowResponse {
  timeZone: string
  meetings: LiveNowView[]
}

export interface AdminLiveMeetingView extends LiveMeetingInput {
  id: string
  next: { date: string, startsAt: string, endsAt: string, showing: boolean } | null
  updatedAt: string
}
