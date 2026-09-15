// Live meetings: who sees which link, and when. The schedule rules are in shared/live.ts.
import { eq } from 'drizzle-orm'
import {
  nextOccurrence,
  normalizeLiveLink,
  parseYouTubeLive,
  showingOccurrence,
  type AdminLiveMeetingView,
  type LiveMeetingInput,
  type LiveNowView,
} from '../../shared/live.ts'
import { liveMeetings } from '../database/schema/index.ts'
import { db } from './db.ts'

export const churchTimeZone = () => process.env.CHURCH_TIME_ZONE || 'America/Detroit'

type LiveMeetingRow = typeof liveMeetings.$inferSelect

export const loadLiveMeeting = (id: string) => db.select().from(liveMeetings).where(eq(liveMeetings.id, id)).get()

export const presentAdminLiveMeeting = (row: LiveMeetingRow, now = new Date()): AdminLiveMeetingView => {
  const timeZone = churchTimeZone()
  const next = nextOccurrence(row, now, timeZone)
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    link: row.link,
    visibility: row.visibility,
    repeat: row.repeat,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    startTime: row.startTime,
    endTime: row.endTime,
    skippedDates: row.skippedDates,
    next: next && {
      date: next.date,
      startsAt: next.startsAt.toISOString(),
      endsAt: next.endsAt.toISOString(),
      showing: showingOccurrence(row, now, timeZone)?.date === next.date,
    },
    updatedAt: row.updatedAt.toISOString(),
  }
}

// Meetings still to come first, then by when they next happen; ended ones last.
export const loadAdminLiveMeetings = (now = new Date()) =>
  db.select().from(liveMeetings).all()
    .map(row => presentAdminLiveMeeting(row, now))
    .sort((a, b) => (a.next?.startsAt ?? '9999').localeCompare(b.next?.startsAt ?? '9999') || a.title.localeCompare(b.title))

// The values to store: the link normalized, and weekly-only fields cleared for a one-time meeting.
export const toLiveMeetingValues = (input: LiveMeetingInput) => ({
  ...input,
  link: normalizeLiveLink(input.kind, input.link)!,
  endsOn: input.repeat === 'weekly' ? input.endsOn : null,
  skippedDates: input.repeat === 'weekly' ? [...new Set(input.skippedDates)].sort() : [],
})

// Meetings showing now. A members-only meeting's name and link reach members only.
export const liveNowFor = (viewer: { mayJoinMembersOnly: boolean }, now = new Date()): LiveNowView[] => {
  const timeZone = churchTimeZone()
  return db.select().from(liveMeetings).all()
    .flatMap((row) => {
      const occurrence = showingOccurrence(row, now, timeZone)
      if (!occurrence) return []
      const mayJoin = row.visibility === 'public' || viewer.mayJoinMembersOnly
      return [{
        id: row.id,
        title: mayJoin ? row.title : null,
        kind: row.kind,
        visibility: row.visibility,
        startsAt: occurrence.startsAt.toISOString(),
        endsAt: occurrence.endsAt.toISOString(),
        link: mayJoin ? row.link : null,
        youtube: mayJoin && row.kind === 'youtube' ? parseYouTubeLive(row.link) : null,
      }]
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}
