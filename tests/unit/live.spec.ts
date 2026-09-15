// Live meetings: schedules, the church's clock, and who gets the link.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  liveMeetingSchema,
  nextOccurrence,
  normalizeLiveLink,
  parseYouTubeLive,
  scheduleDates,
  showingOccurrence,
  type LiveMeetingInput,
} from '../../shared/live'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-live-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.CHURCH_TIME_ZONE = 'America/Detroit'

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let lib: typeof import('../../server/lib/live')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/live')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const TZ = 'America/Detroit'

// Sunday mornings from 20 September 2026, 11:00 to 12:30.
const sunday: LiveMeetingInput = {
  title: 'Sunday worship',
  kind: 'meet',
  link: 'https://meet.google.com/ien-eddo-zjq',
  visibility: 'public',
  repeat: 'weekly',
  startsOn: '2026-09-20',
  endsOn: null,
  startTime: '11:00',
  endTime: '12:30',
  skippedDates: [],
}

describe('live meeting links', () => {
  it('accepts Meet links, YouTube videos and channels, and stores them the same way each time', () => {
    expect(normalizeLiveLink('meet', 'meet.google.com/ien-eddo-zjq?authuser=0')).toBe('https://meet.google.com/ien-eddo-zjq?authuser=0')
    expect(normalizeLiveLink('meet', 'https://zoom.us/j/123')).toBeNull()
    expect(normalizeLiveLink('youtube', 'https://www.youtube.com/live/dQw4w9WgXcQ?si=x')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(normalizeLiveLink('youtube', 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')).toBe('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')
    expect(normalizeLiveLink('youtube', 'https://www.youtube.com/@lifegate')).toBeNull()
    expect(parseYouTubeLive('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')).toEqual({ channelId: 'UCabcdefghijklmnopqrstuv' })
  })

  it('refuses a link of the wrong kind, and an end before the start', () => {
    expect(liveMeetingSchema.safeParse(sunday).success).toBe(true)
    const wrong = liveMeetingSchema.safeParse({ ...sunday, kind: 'youtube' })
    expect(wrong.error?.issues.map(i => i.path[0])).toEqual(['link'])
    const backwards = liveMeetingSchema.safeParse({ ...sunday, endTime: '10:00' })
    expect(backwards.error?.issues.map(i => i.path[0])).toEqual(['endTime'])
  })
})

describe('schedules', () => {
  it('lists weekly dates from a day, up to the last date', () => {
    expect(scheduleDates(sunday, '2026-09-22', 3)).toEqual(['2026-09-27', '2026-10-04', '2026-10-11'])
    expect(scheduleDates({ ...sunday, endsOn: '2026-10-01' }, '2026-09-01', 5)).toEqual(['2026-09-20', '2026-09-27'])
    expect(scheduleDates({ ...sunday, repeat: 'once' }, '2026-09-21', 5)).toEqual([])
  })

  it('keeps to the church’s clock across the change from daylight time', () => {
    expect(nextOccurrence(sunday, new Date('2026-10-25T12:00:00Z'), TZ)!.startsAt.toISOString()).toBe('2026-10-25T15:00:00.000Z')
    expect(nextOccurrence(sunday, new Date('2026-10-26T12:00:00Z'), TZ)!.startsAt.toISOString()).toBe('2026-11-01T16:00:00.000Z')
  })

  it('shows a meeting from fifteen minutes before it starts until it ends, and not on a skipped date', () => {
    // 10:44, 10:45, 12:29 and 12:30 in Michigan (UTC-4).
    expect(showingOccurrence(sunday, new Date('2026-09-27T14:44:00Z'), TZ)).toBeNull()
    expect(showingOccurrence(sunday, new Date('2026-09-27T14:45:00Z'), TZ)?.date).toBe('2026-09-27')
    expect(showingOccurrence(sunday, new Date('2026-09-27T16:29:00Z'), TZ)?.date).toBe('2026-09-27')
    expect(showingOccurrence(sunday, new Date('2026-09-27T16:30:00Z'), TZ)).toBeNull()
    // A Wednesday.
    expect(showingOccurrence(sunday, new Date('2026-09-30T15:00:00Z'), TZ)).toBeNull()

    const skipped = { ...sunday, skippedDates: ['2026-09-27'] }
    expect(showingOccurrence(skipped, new Date('2026-09-27T15:00:00Z'), TZ)).toBeNull()
    expect(nextOccurrence(skipped, new Date('2026-09-21T12:00:00Z'), TZ)?.date).toBe('2026-10-04')
  })

  it('opens a meeting just after midnight the evening before', () => {
    const early = { ...sunday, repeat: 'once' as const, startsOn: '2026-09-21', startTime: '00:05', endTime: '01:00' }
    // 23:55 on the 20th, Michigan time.
    expect(showingOccurrence(early, new Date('2026-09-21T03:55:00Z'), TZ)?.date).toBe('2026-09-21')
  })
})

describe('who gets the link', () => {
  it('gives members-only names and links to members only, and shows nothing outside the scheduled time', () => {
    db.insert(schema.liveMeetings).values([
      lib.toLiveMeetingValues(sunday),
      lib.toLiveMeetingValues({ ...sunday, title: 'Members prayer', kind: 'youtube', link: 'https://youtu.be/dQw4w9WgXcQ', visibility: 'members', skippedDates: ['2026-09-20'] }),
    ]).run()
    const during = new Date('2026-09-27T15:30:00Z')

    const publicView = lib.liveNowFor({ mayJoinMembersOnly: false }, during)
    expect(publicView.map(m => [m.title, m.link])).toEqual([
      ['Sunday worship', 'https://meet.google.com/ien-eddo-zjq'],
      [null, null],
    ])
    expect(publicView[1]!.youtube).toBeNull()

    const memberView = lib.liveNowFor({ mayJoinMembersOnly: true }, during)
    expect(memberView[1]).toMatchObject({ title: 'Members prayer', youtube: { videoId: 'dQw4w9WgXcQ' } })

    expect(lib.liveNowFor({ mayJoinMembersOnly: true }, new Date('2026-09-27T17:00:00Z'))).toEqual([])
    // The members' meeting skips the 20th.
    expect(lib.liveNowFor({ mayJoinMembersOnly: true }, new Date('2026-09-20T15:30:00Z')).map(m => m.title)).toEqual(['Sunday worship'])
  })

  it('clears weekly-only fields for a one-time meeting', () => {
    const values = lib.toLiveMeetingValues({ ...sunday, repeat: 'once', endsOn: '2026-12-01', skippedDates: ['2026-09-27'] })
    expect(values).toMatchObject({ endsOn: null, skippedDates: [] })
  })
})
