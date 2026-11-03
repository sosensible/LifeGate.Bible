// Working out which teaching a recording belongs to, for importing videos copied onto the church
// server by hand. Everything here only suggests; a person confirms each match.
import { detailsFromFileName } from './hosted-video'

export const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.mts', '.m2ts'] as const

// Where a date came from, most trustworthy first.
export type DateSource = 'file-name' | 'video' | 'file-date'
export interface GuessedDate { date: string, source: DateSource }

export const isVideoName = (name: string) => VIDEO_EXTENSIONS.some(extension => name.toLowerCase().endsWith(extension))

// The calendar day an instant falls on in the church's own time zone: a service recorded on
// Sunday evening must not become Monday because the file stores UTC.
export const dayIn = (instant: string | Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant))
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

// The date in the file name if it starts with one, else the video's own creation date, else when
// the file was last changed. The last is a poor guide (copying or exporting resets it), so the
// screen says which one it used.
export const guessDate = (input: { fileName: string, videoCreatedAt: string | null, modifiedAt: string, timeZone: string }): GuessedDate => {
  const named = detailsFromFileName(input.fileName).date
  if (named) return { date: named, source: 'file-name' }
  if (input.videoCreatedAt) return { date: dayIn(input.videoCreatedAt, input.timeZone), source: 'video' }
  return { date: dayIn(input.modifiedAt, input.timeZone), source: 'file-date' }
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'part', 'sermon', 'service', 'message', 'sunday', 'morning', 'evening', 'video'])
const words = (text: string) => new Set(text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(word => word.length > 2 && !STOP_WORDS.has(word)))

// The share of the shorter title's words found in the other, 0 to 1.
export const titleOverlap = (a: string, b: string) => {
  const first = words(a)
  const second = words(b)
  if (!first.size || !second.size) return 0
  let shared = 0
  for (const word of first) if (second.has(word)) shared += 1
  return shared / Math.min(first.size, second.size)
}

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000)

export interface TeachingChoice { id: string, title: string, preachedOn: string, speaker: string, hasCopy: boolean }
export interface Suggestion extends TeachingChoice { daysApart: number, titleMatch: number }

// Up to five teachings that could be this recording, best first: the same or a nearby day, and
// words in common with the file's name. A title match outweighs a few days, because a file's date
// is often when it was exported rather than when it was preached.
export const suggestTeachings = (teachings: TeachingChoice[], guessed: GuessedDate, fileName: string, limit = 5): Suggestion[] => {
  const title = detailsFromFileName(fileName).title
  return teachings
    .map(teaching => ({
      ...teaching,
      daysApart: Math.abs(dayNumber(teaching.preachedOn) - dayNumber(guessed.date)),
      titleMatch: titleOverlap(title, teaching.title),
    }))
    .filter(candidate => candidate.daysApart <= 7 || candidate.titleMatch >= 0.5)
    .sort((a, b) => (b.titleMatch * 100 - Math.min(b.daysApart, 60)) - (a.titleMatch * 100 - Math.min(a.daysApart, 60)) || b.preachedOn.localeCompare(a.preachedOn))
    .slice(0, limit)
}

export const formatDuration = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return ''
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`
}
