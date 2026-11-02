import { z } from 'zod'

// A shared broadcast: a locked page on this site where people watch a stream that comes from elsewhere
// (the church's soStream). This app decides only WHO may watch and HOW MANY; it does not carry the stream.
//
// Members, signed in, watch with no code. If the broadcast also admits guests, each guest needs a
// code made for that one person. An optional cap limits how many people in total may take a seat.
export const BROADCAST_AUDIENCES = ['members', 'members_and_guests'] as const
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number]

export const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  members: 'Signed-in members only',
  members_and_guests: 'Members, and guests with a code',
}

export type BroadcastAvailability = 'not-open' | 'open' | 'closed'

// Open only while the switch is on and the dates, if any, allow it.
export const broadcastAvailability = (broadcast: { isOpen: boolean, opensAt: Date | null, closesAt: Date | null }, now: Date): BroadcastAvailability => {
  if (broadcast.closesAt && now >= broadcast.closesAt) return 'closed'
  if (!broadcast.isOpen) return 'not-open'
  if (broadcast.opensAt && now < broadcast.opensAt) return 'not-open'
  return 'open'
}

// ---- Guest codes ---------------------------------------------------------------------

// Letters and digits that cannot be mistaken for each other (no 0/O, 1/I/L, 2/Z, 5/S, 8/B ...).
export const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY3469'
export const CODE_LENGTH = 10

// "ACDEF-GHJKM": ten letters in two groups, easy to read out or type.
export const formatCode = (raw: string) => `${raw.slice(0, 5)}-${raw.slice(5)}`

// What was typed, tidied: upper case, dashes and spaces dropped, look-alike characters left as they are
// (a code with one is simply wrong).
export const normalizeCode = (typed: string) => typed.toUpperCase().replace(/[\s-]/g, '')

export const looksLikeCode = (typed: string) => {
  const code = normalizeCode(typed)
  return code.length === CODE_LENGTH && [...code].every(char => CODE_ALPHABET.includes(char))
}

// Where the stream is shown from: an https address, optionally with {viewer} replaced by an opaque
// id for the person watching, so the stream's own side can tell viewers apart.
export const STREAM_URL_MAX = 500
export const isValidStreamUrl = (value: string) => {
  try {
    const url = new URL(value.replace('{viewer}', 'viewer'))
    return url.protocol === 'https:' && value.length <= STREAM_URL_MAX
  }
  catch {
    return false
  }
}

export const embedUrlFor = (template: string, viewerId: string) => template.replace(/\{viewer\}/g, encodeURIComponent(viewerId))

// What the watching page is told.
export interface WatchView {
  title: string
  description: string | null
  availability: BroadcastAvailability
  // What the person must do to get in, if they are not in yet: sign in, or (signed in but not a member) ask to be made one, or enter a code.
  needs: 'sign-in' | 'members' | 'code' | null
  // Seats are all taken, and this person does not hold one.
  full: boolean
  // They may watch now; the stream's address is only sent then.
  embedUrl: string | null
}

export type PassState = 'unused' | 'in-use' | 'revoked'
export interface PassView {
  id: string
  label: string
  state: PassState
  createdAt: string
  usedAt: string | null
}

export interface BroadcastAdminView {
  id: string
  slug: string
  title: string
  description: string | null
  streamUrl: string
  audience: BroadcastAudience
  maxViewers: number | null
  isOpen: boolean
  opensAt: string | null
  closesAt: string | null
  availability: BroadcastAvailability
  seatsTaken: number
  passes: PassView[]
}

// What an administrator enters for a broadcast.
const optionalDate = z.union([z.iso.datetime({ offset: true }), z.literal(''), z.null()]).optional()
const broadcastFields = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  streamUrl: z.string().trim().refine(isValidStreamUrl, 'Enter the stream’s address, starting with https://'),
  audience: z.enum(BROADCAST_AUDIENCES),
  maxViewers: z.number().int().min(1, 'Leave empty for no limit').max(100000).nullable().optional(),
  isOpen: z.boolean(),
  opensAt: optionalDate,
  closesAt: optionalDate,
})
const closesAfterOpens = (value: { opensAt?: string | null, closesAt?: string | null }) =>
  !value.opensAt || !value.closesAt || new Date(value.closesAt) > new Date(value.opensAt)
const closesAfterOpensMessage = { message: 'It must close after it opens', path: ['closesAt'] }

export const broadcastSchema = broadcastFields.refine(closesAfterOpens, closesAfterOpensMessage)
export type BroadcastInput = z.infer<typeof broadcastSchema>
export const broadcastUpdateSchema = broadcastFields.partial().refine(closesAfterOpens, closesAfterOpensMessage)

export const passSchema = z.object({ label: z.string().trim().min(1, 'Enter who the code is for').max(120) })
