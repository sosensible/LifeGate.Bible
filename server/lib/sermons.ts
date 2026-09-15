// Reading sermons and deciding who may see each one.
import { and, asc, desc, eq, like, or } from 'drizzle-orm'
import { createError } from 'h3'
import { byBibleOrder } from '../../shared/bible.ts'
import { sermonSlug, type AdminSermonView, type SermonInput, type SermonView, type SpeakerChoice } from '../../shared/sermons.ts'
import { parseYouTubeId } from '../../shared/youtube.ts'
import { people, sermonSeries, sermons } from '../database/schema/index.ts'
import { db } from './db.ts'

export type SermonRow = typeof sermons.$inferSelect & { seriesName: string | null }

export interface SermonViewer {
  // Holds memberArea:view.
  isMember: boolean
  // Holds sermon:update, so may see drafts.
  canManage: boolean
}

// Newest first. The caller decides what anyone may see.
export const loadSermons = (where?: { id?: string, slug?: string }): SermonRow[] =>
  db
    .select({ sermon: sermons, seriesName: sermonSeries.name })
    .from(sermons)
    .leftJoin(sermonSeries, eq(sermons.seriesId, sermonSeries.id))
    .where(where?.id ? eq(sermons.id, where.id) : where?.slug ? eq(sermons.slug, where.slug) : undefined)
    .orderBy(desc(sermons.preachedOn), desc(sermons.createdAt))
    .all()
    .map(({ sermon, seriesName }) => ({ ...sermon, seriesName }))

export const loadSermon = (where: { id?: string, slug?: string }): SermonRow | undefined => loadSermons(where)[0]

// Drafts: only people who manage sermons. Members-only: members (and managers).
// Public and published: everyone.
export const canViewSermon = (sermon: Pick<SermonRow, 'status' | 'visibility'>, viewer: SermonViewer) => {
  if (sermon.status !== 'published') return viewer.canManage
  if (sermon.visibility === 'members') return viewer.isMember || viewer.canManage
  return true
}

export const presentSermon = (sermon: SermonRow): SermonView => ({
  id: sermon.id,
  slug: sermon.slug,
  title: sermon.title,
  preachedOn: sermon.preachedOn,
  speaker: sermon.speaker,
  series: sermon.seriesId && sermon.seriesName ? { id: sermon.seriesId, name: sermon.seriesName } : null,
  scripture: sermon.scripture,
  books: sermon.books,
  tags: sermon.tags,
  description: sermon.description,
  visibility: sermon.visibility,
  videoProvider: sermon.videoProvider,
  videoId: sermon.videoId,
})

export const presentAdminSermon = (sermon: SermonRow): AdminSermonView => ({
  ...presentSermon(sermon),
  speakerPersonId: sermon.speakerPersonId,
  status: sermon.status,
  publishedAt: sermon.publishedAt?.toISOString() ?? null,
  updatedAt: sermon.updatedAt.toISOString(),
})

// Form input -> column values. Only the fields present are converted, so the
// same function serves create and partial update.
export const toSermonValues = (input: Partial<SermonInput>) => {
  const { video, scripture, description, tags, books, ...rest } = input
  const values: Partial<typeof sermons.$inferInsert> = { ...rest }

  if (video !== undefined) {
    const videoId = video ? parseYouTubeId(video) : null
    values.videoProvider = videoId ? 'youtube' : null
    values.videoId = videoId
  }
  if (scripture !== undefined) values.scripture = scripture || null
  if (description !== undefined) values.description = description || null
  if (books !== undefined) values.books = [...new Set(books)].sort(byBibleOrder)
  if (tags !== undefined) {
    // One spelling per tag, ignoring case: "Grace" and "grace" are the same topic.
    const seen = new Set<string>()
    values.tags = tags.filter((tag) => {
      const key = tag.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return values
}

// A slug nobody else has: "2025-06-22-the-good-shepherd", then "-2", "-3"...
export const uniqueSermonSlug = (preachedOn: string, title: string) => {
  const base = sermonSlug(preachedOn, title) || preachedOn
  const taken = new Set(db.select({ slug: sermons.slug }).from(sermons)
    .where(or(eq(sermons.slug, base), like(sermons.slug, `${base}-%`))).all().map(row => row.slug))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

// A speaker picked in the sermon form must be on the Speakers list.
export const assertSpeakerPerson = (personId: string | null | undefined) => {
  if (!personId) return
  if (!db.select({ id: people.id }).from(people).where(and(eq(people.id, personId), eq(people.isSpeaker, true))).get()) {
    throw createError({ statusCode: 400, statusMessage: 'That speaker is not on the Speakers list' })
  }
}

// Active speakers for the sermon form, plus any archived one a message still names.
export const speakerChoices = (): SpeakerChoice[] => {
  const linked = new Set(db.select({ id: sermons.speakerPersonId }).from(sermons).all().map(r => r.id).filter(Boolean))
  return db.select({ id: people.id, first: people.firstName, last: people.lastName, archivedAt: people.speakerArchivedAt })
    .from(people)
    .where(eq(people.isSpeaker, true))
    .orderBy(asc(people.lastName), asc(people.firstName))
    .all()
    .filter(p => !p.archivedAt || linked.has(p.id))
    .map(p => ({ id: p.id, name: `${p.first} ${p.last}` }))
}

// ---- Teachers ----------------------------------------------------------------
// A teacher is the person linked to a signed-in account whom a message names as
// its speaker. They may edit that message's details (teacherSermonSchema).

export const teacherPersonId = (userId: string) =>
  db.select({ id: people.id }).from(people).where(eq(people.userId, userId)).get()?.id ?? null

export const isTeacherOf = (sermon: Pick<SermonRow, 'speakerPersonId'>, userId: string | null | undefined) => {
  if (!userId || !sermon.speakerPersonId) return false
  return teacherPersonId(userId) === sermon.speakerPersonId
}

// A teacher's own messages, drafts included.
export const loadTeacherSermons = (userId: string) => {
  const personId = teacherPersonId(userId)
  if (!personId) return []
  return loadSermons().filter(sermon => sermon.speakerPersonId === personId)
}

export const assertSeriesExists = (seriesId: string | null | undefined) => {
  if (!seriesId) return
  if (!db.select({ id: sermonSeries.id }).from(sermonSeries).where(eq(sermonSeries.id, seriesId)).get()) {
    throw createError({ statusCode: 400, statusMessage: 'That series no longer exists' })
  }
}

// The sermons a viewer may see, plus how many published members-only sermons
// they cannot, so the page can invite them to sign in. Titles of hidden
// sermons are never sent.
export const listSermonsFor = (viewer: SermonViewer) => {
  const all = loadSermons()
  const visible = all.filter(sermon => sermon.status === 'published' && canViewSermon(sermon, viewer))
  const hiddenCount = all.filter(sermon => sermon.status === 'published' && !canViewSermon(sermon, viewer)).length
  return { sermons: visible.map(presentSermon), hiddenCount }
}
