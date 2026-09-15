// Wording for live meeting times. Instants are shown on the church's clock,
// whatever the viewer's own time zone.
import type { AdminLiveMeetingView } from '#shared/live'

// "11:00 AM" from an ISO instant.
export const formatLiveInstant = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })

// "11:00 AM" from "11:00".
export const formatLiveClock = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number) as [number, number]
  return new Date(Date.UTC(2000, 0, 1, hours, minutes)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

const dateParts = (date: string) => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day))
}

// "Sun, Sep 20"
export const formatLiveDate = (date: string) =>
  dateParts(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

// "Every Sunday, 11:00 AM–12:30 PM" or "Sun, Sep 20, 2026, 7:00 PM–8:00 PM"
export const describeLiveSchedule = (meeting: Pick<AdminLiveMeetingView, 'repeat' | 'startsOn' | 'endsOn' | 'startTime' | 'endTime'>) => {
  const times = `${formatLiveClock(meeting.startTime)}–${formatLiveClock(meeting.endTime)}`
  if (meeting.repeat === 'once') {
    return `${dateParts(meeting.startsOn).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}, ${times}`
  }
  const weekday = dateParts(meeting.startsOn).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  return `Every ${weekday}, ${times}`
}

// The church's date today, YYYY-MM-DD.
export const churchToday = (timeZone: string) => new Date().toLocaleDateString('en-CA', { timeZone })
