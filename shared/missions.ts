// Missions: validation and shapes shared by the pages and the server.
// The Missions pages are members-only.
import { z } from 'zod'

export const MISSIONARY_KIND_LABELS = { family: 'Family', individual: 'Individual' } as const
export const MISSIONARY_STATUS_LABELS = {
  onField: 'On the field',
  furlough: 'Home on furlough',
  raisingSupport: 'Raising support',
  retired: 'Retired',
} as const

export type MissionaryKind = keyof typeof MISSIONARY_KIND_LABELS
export type MissionaryStatus = keyof typeof MISSIONARY_STATUS_LABELS

const text = (max: number) => z.string().trim().max(max).nullable()
// A web address, or empty. Only http(s), so a link can never run script.
const link = z.union([z.literal(''), z.url({ protocol: /^https?$/, message: 'Enter a full web address starting with https://' })]).nullable()
// A stored photo name returned by the upload endpoint, or empty.
const photo = z.string().regex(/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/).nullable()

export const organizationSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(160),
  photo,
  writeup: text(10_000),
  website: link,
  relationship: text(200),
})

export const missionarySchema = z.object({
  kind: z.enum(['family', 'individual']),
  name: z.string().trim().min(1, 'Enter a name').max(160),
  photo,
  writeup: text(10_000),
  familyNames: text(300),
  field: text(120),
  focus: text(160),
  organizationId: z.string().min(1).nullable(),
  status: z.enum(['onField', 'furlough', 'raisingSupport', 'retired']),
  startedYear: z.number().int().min(1900).max(2200).nullable(),
  supportUrl: link,
  email: z.union([z.literal(''), z.email('Enter a valid email address')]).nullable(),
  phone: text(40),
  mailingAddress: text(400),
  website: link,
  shareContact: z.boolean(),
  nextVisitOn: z.union([z.literal(''), z.iso.date()]).nullable(),
  nextVisitNote: text(200),
})

export const missionUpdateSchema = z.object({
  kind: z.enum(['prayer', 'letter']),
  postedOn: z.iso.date('Enter a date'),
  title: text(200),
  body: text(10_000),
  url: link,
}).refine(update => Boolean(update.body?.trim() || update.url), { message: 'Write the update or add a link to it', path: ['body'] })

export type OrganizationInput = z.infer<typeof organizationSchema>
export type MissionaryInput = z.infer<typeof missionarySchema>
export type MissionUpdateInput = z.infer<typeof missionUpdateSchema>

// "Tom & Anna Reyes" -> "tom-anna-reyes"
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')

export interface OrganizationView {
  id: string
  slug: string
  name: string
  photoUrl: string | null
  photo: string | null
  writeup: string | null
  website: string | null
  relationship: string | null
  missionaryCount: number
}

export interface MissionUpdateView {
  id: string
  kind: 'prayer' | 'letter'
  postedOn: string
  title: string | null
  body: string | null
  url: string | null
}

export interface MissionaryView {
  id: string
  slug: string
  kind: MissionaryKind
  name: string
  photo: string | null
  photoUrl: string | null
  writeup: string | null
  familyNames: string | null
  field: string | null
  focus: string | null
  organization: { id: string, slug: string, name: string } | null
  status: MissionaryStatus
  startedYear: number | null
  supportUrl: string | null
  // Present for members only when shareContact is on; always for editors.
  email?: string | null
  phone?: string | null
  mailingAddress?: string | null
  website?: string | null
  shareContact: boolean
  nextVisitOn: string | null
  nextVisitNote: string | null
  updates: MissionUpdateView[]
}
