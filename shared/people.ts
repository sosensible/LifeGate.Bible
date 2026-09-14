// Validation for directory records, shared by the forms (UForm :schema) and the
// server routes (readValidatedBody). The server is what enforces it.
import { z } from 'zod'

// Optional text: trimmed; an empty field means "none".
const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep this under ${max} characters`).nullable()

export const contactFields = {
  phone: optionalText(40),
  email: z.union([z.literal(''), z.email('Enter a valid email address')]).nullable(),
  address: optionalText(300),
  birthday: z.union([z.literal(''), z.iso.date('Enter a date')]).nullable(),
}

export const privacyFields = {
  sharePhone: z.boolean(),
  shareEmail: z.boolean(),
  shareAddress: z.boolean(),
  shareBirthday: z.boolean(),
  sharePhoto: z.boolean(),
  shareHousehold: z.boolean(),
}

export type PrivacyField = keyof typeof privacyFields
export const PRIVACY_FIELDS = Object.keys(privacyFields) as PrivacyField[]

// What a person may change about themselves on /profile. Names, title,
// household and ministries are kept by the church office.
// Roster choices, one per ministry the person serves in.
export const rosterChoiceSchema = z.object({
  ministryId: z.string().min(1),
  showToMembers: z.boolean(),
  showPublicly: z.boolean(),
})

export const profileUpdateSchema = z.object({
  ...contactFields,
  ...privacyFields,
  rosters: z.array(rosterChoiceSchema).max(50),
}).partial()

export const privacyUpdateSchema = z.object(privacyFields).partial()

// Nobody may change what they cannot see. Staff always see contact info, so they
// can keep it current. A birthday (and later a photo) is hidden from staff
// until the person shares it, so a new record has none: the person adds it
// from their own profile.
export const personSchema = z.object({
  // Title is its own field, shown beside the name. Never part of the name.
  firstName: z.string().trim().min(1, 'Enter a first name').max(80),
  lastName: z.string().trim().min(1, 'Enter a last name').max(80),
  title: optionalText(80),
  isMinor: z.boolean(),
  // A guest (e.g. a guest speaker) is not a church member.
  kind: z.enum(['member', 'guest']),
  isSpeaker: z.boolean(),
  // Household membership is set in the household editor, with a role.
  ministryIds: z.array(z.string().min(1)).max(50),
  // Which of those ministries they lead. Set by the church office.
  leaderMinistryIds: z.array(z.string().min(1)).max(50).optional(),
  phone: contactFields.phone,
  email: contactFields.email,
  address: contactFields.address,
})

// Updates are partial. `birthday` is accepted only for a person who shares it;
// the server refuses it otherwise.
export const personUpdateSchema = personSchema.partial().extend({
  birthday: contactFields.birthday.optional(),
})

export const accountLinkSchema = z.object({
  email: z.email('Enter a valid email address'),
})

// A record as the people admin receives it (see presentForAdmin on the server).
export interface AdminPersonView {
  id: string
  firstName: string
  lastName: string
  title: string | null
  isMinor: boolean
  kind: 'member' | 'guest'
  isSpeaker: boolean
  phone: string | null
  email: string | null
  address: string | null
  householdId: string | null
  householdName: string | null
  householdRole: 'husband' | 'wife' | 'father' | 'mother' | 'guardian' | 'child' | null
  ministries: Array<{ id: string, slug: string, name: string, isLeader: boolean, showToMembers: boolean, showPublicly: boolean }>
  // Birthday and photo are only sent when the person shares them. Whether an
  // unshared one exists is not revealed either.
  birthday: string | null
  photoUrl: string | null
  sharePhone: boolean
  shareEmail: boolean
  shareAddress: boolean
  shareBirthday: boolean
  sharePhoto: boolean
  shareHousehold: boolean
  account: { email: string, role: string | null } | null
}

// Empty strings from form fields are stored as NULL.
export const emptyToNull = <T extends Record<string, unknown>>(values: T): T =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]),
  ) as T
