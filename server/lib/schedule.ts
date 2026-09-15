// Calendar arithmetic for plans and recurring transactions. Pure: no database.
// Dates are YYYY-MM-DD and months YYYY-MM, on the church's calendar.
import { addMonths } from '../../shared/stewardship.ts'
import type { RecurringFrequency } from '../../shared/stewardship.ts'

const DAY_MS = 24 * 60 * 60 * 1000

const toUtc = (date: string) => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day)
}

const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// Whole months from one YYYY-MM to another (negative if `to` is earlier).
export const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split('-').map(Number) as [number, number]
  const [ty, tm] = to.split('-').map(Number) as [number, number]
  return (ty - fy) * 12 + (tm - fm)
}

export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

export const addDays = (date: string, days: number) => fromUtc(toUtc(date) + days * DAY_MS)

// The same day of the month, `count` months later. A day the month does not
// have lands on its last day (Jan 31 + 1 month = Feb 28 or 29).
export const addMonthsToDate = (date: string, count: number) => {
  const month = addMonths(date.slice(0, 7), count)
  const [year, index] = month.split('-').map(Number) as [number, number]
  const lastDay = new Date(Date.UTC(year, index, 0)).getUTCDate()
  const day = Math.min(Number(date.slice(8, 10)), lastDay)
  return `${month}-${String(day).padStart(2, '0')}`
}

const MONTH_STEP: Partial<Record<RecurringFrequency, number>> = { monthly: 1, quarterly: 3, yearly: 12 }
const DAY_STEP: Partial<Record<RecurringFrequency, number>> = { weekly: 7, every2Weeks: 14 }

export interface Schedule {
  frequency: RecurringFrequency
  anchorOn: string
  endOn: string | null
}

// Every occurrence from `from` through `to`, inclusive.
export const occurrencesBetween = (schedule: Schedule, from: string, to: string): string[] => {
  const last = schedule.endOn && schedule.endOn < to ? schedule.endOn : to
  if (last < schedule.anchorOn || last < from) return []
  const dates: string[] = []

  const days = DAY_STEP[schedule.frequency]
  if (days) {
    const skip = Math.max(0, Math.floor(daysBetween(schedule.anchorOn, from) / days))
    for (let n = skip; ; n++) {
      const date = addDays(schedule.anchorOn, n * days)
      if (date > last) break
      if (date >= from) dates.push(date)
    }
    return dates
  }

  const months = MONTH_STEP[schedule.frequency]!
  // Counted from the anchor each time, so a 31st stays the 31st where it can.
  const skip = Math.max(0, Math.floor(monthsBetween(schedule.anchorOn.slice(0, 7), from.slice(0, 7)) / months) - 1)
  for (let n = skip; ; n++) {
    const date = addMonthsToDate(schedule.anchorOn, n * months)
    if (date > last) break
    if (date >= from) dates.push(date)
  }
  return dates
}

// The first occurrence on or after a date, or null if the schedule has ended.
export const nextOccurrence = (schedule: Schedule, onOrAfter: string) => {
  const horizon = addMonthsToDate(onOrAfter, 13)
  return occurrencesBetween(schedule, onOrAfter, horizon)[0] ?? null
}
