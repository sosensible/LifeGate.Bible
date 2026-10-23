// The member page: one page for each person in the directory. What it carries is
// exactly what the viewer may see of that person, by the directory's own rules
// (shared/privacy.ts). Everything private to the owner (their tasks, lists,
// teaching, budgets) is deliberately NOT here: it is fetched by the browser from
// endpoints that only answer for the signed-in person. See docs/specs/member-page.md.

export interface PersonMessage {
  id: string
  slug: string
  title: string
  preachedOn: string
  series: { id: string, name: string } | null
  scripture: string | null
  visibility: 'public' | 'members'
}

export interface PersonPageView {
  id: string
  firstName: string
  lastName: string
  title?: string
  // A guest is someone who is not a member, such as a guest speaker.
  kind: 'member' | 'guest'
  isMinor: boolean
  isSpeaker: boolean
  isSelf: boolean
  // Only the details the viewer may see are present; the rest are left out.
  photoUrl?: string
  phone?: string
  email?: string
  address?: string
  birthday?: string // MM-DD
  householdName?: string
  // The household's photo, set by staff. Present only where the household itself is
  // shown to this viewer: someone in it has shared their household, or it is yours.
  householdPhotoUrl?: string
  ministries: Array<{ slug: string, name: string, isLeader: boolean }>
  // Published messages the viewer could open on the Teaching pages. Never drafts.
  messages: PersonMessage[]
  // On your own page only: which of your details other members can see, so the
  // page can say so beside each one.
  sharing?: { phone: boolean, email: boolean, address: boolean, birthday: boolean, photo: boolean, household: boolean }
}
