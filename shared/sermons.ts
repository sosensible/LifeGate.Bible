// Sermon validation and shapes, shared by the admin form and the server routes.
import { z } from 'zod'
import { BIBLE_BOOKS } from './bible.ts'
import { parseYouTubeId } from './youtube.ts'

const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).nullable()

export const sermonSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  preachedOn: z.iso.date('Enter the date it was preached'),
  speaker: z.string().trim().min(1, 'Enter who preached').max(120),
  // Set when the speaker was picked from the Speakers list; null for a typed guest name.
  speakerPersonId: z.string().min(1).nullable().optional(),
  seriesId: z.string().min(1).nullable(),
  scripture: optionalText(200),
  books: z.array(z.enum(BIBLE_BOOKS)).max(66),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  description: optionalText(4000),
  // A YouTube link or id, or empty for a sermon with no video yet.
  video: z.string().trim().max(300).refine(
    value => value === '' || parseYouTubeId(value) !== null,
    'Paste a YouTube video link',
  ),
  visibility: z.enum(['public', 'members']),
  status: z.enum(['draft', 'published']),
})

export const sermonUpdateSchema = sermonSchema.partial()

// What a teacher may change on their own messages: not the video, the speaker,
// who can watch or whether it is published. Other fields are refused, not ignored.
export const teacherSermonSchema = sermonSchema.pick({
  title: true,
  preachedOn: true,
  seriesId: true,
  scripture: true,
  books: true,
  tags: true,
  description: true,
}).partial().strict()

export type TeacherSermonInput = z.infer<typeof teacherSermonSchema>

export type SermonInput = z.infer<typeof sermonSchema>

export const seriesSchema = z.object({
  name: z.string().trim().min(1, 'Enter a series name').max(120),
  description: optionalText(1000),
})

export const videoLookupSchema = z.object({ video: z.string().trim().min(1).max(300) })

// "2025-06-22" + "The Good Shepherd" -> "2025-06-22-the-good-shepherd"
export const sermonSlug = (preachedOn: string, title: string) =>
  `${preachedOn}-${title}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/, '')

// What the teaching pages receive. `videoId` is present only when the viewer
// may watch the sermon.
export interface SermonView {
  id: string
  slug: string
  title: string
  preachedOn: string
  speaker: string
  series: { id: string, name: string } | null
  scripture: string | null
  books: string[]
  tags: string[]
  description: string | null
  visibility: 'public' | 'members'
  videoProvider: 'youtube' | null
  videoId: string | null
}

// What the sermon admin receives: everything, including drafts.
export interface AdminSermonView extends SermonView {
  speakerPersonId: string | null
  status: 'draft' | 'published'
  publishedAt: string | null
  updatedAt: string
}

// A speaker to pick in the sermon form.
export interface SpeakerChoice {
  id: string
  name: string
}

export interface SeriesView {
  id: string
  name: string
  description: string | null
  sermonCount: number
}
