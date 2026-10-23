// The church's own details: validation, the shape every page receives, and the
// small helpers that turn them into the lines a page prints. See
// docs/specs/site-settings.md.
import { z } from 'zod'

export interface ServiceTime {
  // 0 = Sunday ... 6 = Saturday. A real day, not text, so the calendar can repeat it.
  weekday: number
  // 24-hour "HH:MM" in the church's time zone; shown as "10:00 AM".
  time: string
  // "Sunday School". Name it as it is on the Google calendar and that calendar's
  // dates (a moved or cancelled service) are followed.
  label: string
  // "All Ages", optional.
  note: string
  // Also list it on the church calendar every week (unless the Google calendar
  // already has it).
  onCalendar: boolean
}

const text = (max: number) => z.string().trim().max(max)

export const siteSchema = z.object({
  name: z.string().trim().min(1, 'Enter the church’s name').max(80),
  // What sits under the icon on a phone's home screen, so it has to be short.
  shortName: z.string().trim().min(1, 'Enter a short name').max(30),
  description: text(160),
  street: text(120),
  city: text(60),
  region: text(40),
  postalCode: text(12),
  phone: text(30),
  contactEmail: z.union([z.literal(''), z.email('Enter an email address like office@example.org')]),
  serviceTimes: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time'),
    label: z.string().trim().min(1, 'Name the service').max(40),
    note: text(40),
    onCalendar: z.boolean(),
  })).max(8, 'Up to eight service times'),
})
export type SiteInput = z.infer<typeof siteSchema>

// What every page receives. Only things already shown to the public.
export interface SiteView extends SiteInput {
  // 0: the built-in placeholder mark. Otherwise the version of the uploaded set.
  logoVersion: number
  // The logo's proportions, so a page can hold its space before the image arrives.
  logoWidth: number
  logoHeight: number
}

// Neutral, and nobody's: used when the database cannot be read (while the site is
// being built, say) and as the first row. A church sets its own on /admin/site.
export const SITE_DEFAULTS: SiteView = {
  name: 'Your Church Name',
  shortName: 'Church',
  description: 'Welcome to our church.',
  street: '',
  city: '',
  region: '',
  postalCode: '',
  phone: '',
  contactEmail: '',
  serviceTimes: [],
  logoVersion: 0,
  logoWidth: 864,
  logoHeight: 864,
}

// "Eau Claire, Michigan 49111": the line under the church's name.
export const cityLine = (site: Pick<SiteView, 'city' | 'region' | 'postalCode'>) =>
  [site.city, [site.region, site.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')

// The street, if there is one, then the city line.
export const addressLines = (site: Pick<SiteView, 'street' | 'city' | 'region' | 'postalCode'>) =>
  [site.street, cityLine(site)].filter(Boolean)

// "Eau Claire, Michigan": the place without the postal code, for sentences.
export const placeName = (site: Pick<SiteView, 'city' | 'region'>) => [site.city, site.region].filter(Boolean).join(', ')

// Where the legal pages and the contact page send a question: the church's
// email, or, until it has set one, its office.
export const contactPhrase = (site: Pick<SiteView, 'contactEmail'>) => site.contactEmail || 'the church office'

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const weekdayShort = (weekday: number) => WEEKDAYS[weekday]?.slice(0, 3) ?? ''

// "13:30" -> "1:30 PM".
export const clock12 = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return `${(h! % 12) || 12}:${String(m).padStart(2, '0')} ${h! < 12 ? 'AM' : 'PM'}`
}

// What a page prints for one service: the usual day and time, or the coming one.
export interface ServiceShown {
  label: string
  note: string
  // "Sun", "10:00 AM".
  day: string
  time: string
  // The coming date when the calendar has moved it from the usual day or time
  // ("Dec 25"); empty otherwise.
  changed: string
}

export const serviceShown = (service: ServiceTime): ServiceShown => ({
  label: service.label,
  note: service.note,
  day: weekdayShort(service.weekday),
  time: clock12(service.time),
  changed: '',
})

// "Sun 10:00 AM — Sunday School (All Ages)".
export const serviceTimeLine = (service: ServiceShown) =>
  `${service.day} ${service.time} — ${service.label}${service.note ? ` (${service.note})` : ''}`
