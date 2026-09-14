// Speakers: validation and shapes for the Speakers list in the directory.
import { z } from 'zod'
import { contactFields } from './people.ts'

// A guest speaker's own record. Contact details are shown to members only
// when the speaker chooses to share them.
export const guestSpeakerSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name').max(80),
  lastName: z.string().trim().min(1, 'Enter a last name').max(80),
  title: z.string().trim().max(80).nullable(),
  phone: contactFields.phone,
  email: contactFields.email,
  sharePhone: z.boolean(),
  shareEmail: z.boolean(),
})

// Add a speaker: a new guest, or a church member already in the directory.
export const speakerAddSchema = z.discriminatedUnion('source', [
  guestSpeakerSchema.extend({ source: z.literal('guest') }),
  z.object({ source: z.literal('member'), personId: z.string().min(1, 'Choose a member') }),
])

export type GuestSpeakerInput = z.infer<typeof guestSpeakerSchema>
export type SpeakerAddInput = z.infer<typeof speakerAddSchema>

// A speaker as the people who keep the list receive them. Contact details are
// sent for guests only: a member's details are theirs to keep, on /profile.
export interface SpeakerView {
  id: string
  firstName: string
  lastName: string
  title: string | null
  kind: 'member' | 'guest'
  phone: string | null
  email: string | null
  sharePhone: boolean
  shareEmail: boolean
  archivedAt: string | null
}
