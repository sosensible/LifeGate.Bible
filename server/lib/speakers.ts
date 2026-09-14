// Keeping the Speakers list: guest speakers' records, and which members speak.
import { and, asc, eq, isNotNull, isNull, not } from 'drizzle-orm'
import { createError } from 'h3'
import type { SpeakerView } from '../../shared/speakers.ts'
import { people } from '../database/schema/index.ts'
import { db } from './db.ts'

type PersonRow = typeof people.$inferSelect

export const presentSpeaker = (p: PersonRow): SpeakerView => ({
  id: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  title: p.title,
  kind: p.kind,
  phone: p.kind === 'guest' ? p.phone : null,
  email: p.kind === 'guest' ? p.email : null,
  sharePhone: p.sharePhone,
  shareEmail: p.shareEmail,
  archivedAt: p.speakerArchivedAt?.toISOString() ?? null,
})

export const loadSpeakers = (shelf: 'active' | 'archived' = 'active') =>
  db.select().from(people)
    .where(and(eq(people.isSpeaker, true), shelf === 'archived' ? isNotNull(people.speakerArchivedAt) : isNull(people.speakerArchivedAt)))
    .orderBy(asc(people.lastName), asc(people.firstName))
    .all()
    .map(presentSpeaker)

// Adults in the church who are not yet speakers, for "Add a member".
export const loadSpeakerCandidates = () =>
  db.select({ id: people.id, firstName: people.firstName, lastName: people.lastName }).from(people)
    .where(and(eq(people.kind, 'member'), eq(people.isMinor, false), not(people.isSpeaker)))
    .orderBy(asc(people.lastName), asc(people.firstName))
    .all()

// The speaker to change. Archived speakers do not exist for people who cannot see the archive.
export const findSpeaker = (id: string, canSeeArchived: boolean) => {
  const row = db.select().from(people).where(and(eq(people.id, id), eq(people.isSpeaker, true))).get()
  if (!row || (row.speakerArchivedAt && !canSeeArchived)) throw createError({ statusCode: 404, statusMessage: 'Speaker not found' })
  return row
}
