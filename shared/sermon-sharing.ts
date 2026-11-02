// Who may see a message, once everyone with a say has had it.
//
// Four parties each have their own control, and none can override another:
//
//   the office     publishes it, and sets members-only or public (status, visibility)
//   its teacher    may limit it to members, or withdraw it (teacherShare)
//   the pastor     may pause sharing of it (a hold)
//   an administrator may pause sharing of it (a hold)
//
// A message is shown to the NARROWEST audience any of them allows, and to nobody
// while any one of them is blocking it. Each party can only narrow, never widen
// what another has set.
export const TEACHER_SHARES = ['public', 'members', 'none'] as const
export type TeacherShare = (typeof TEACHER_SHARES)[number]

export const HOLD_PARTIES = ['pastor', 'admin'] as const
export type HoldParty = (typeof HOLD_PARTIES)[number]

export type Blocker = 'teacher' | HoldParty

export const BLOCKER_LABELS: Record<Blocker, string> = {
  teacher: 'the teacher',
  pastor: 'the pastor',
  admin: 'an administrator',
}

export const TEACHER_SHARE_LABELS: Record<TeacherShare, string> = {
  public: 'Anyone, if the office allows it',
  members: 'Members only',
  none: 'Not shared',
}

export interface Availability {
  // Who may see it: everyone, members only, or nobody (apart from those who run
  // the teaching, and the parties above).
  audience: 'public' | 'members' | 'nobody'
  // Everyone blocking it right now, so a screen can say who.
  blockedBy: Blocker[]
  // The office has not published it.
  draft: boolean
}

export const availability = (message: {
  status: 'draft' | 'published'
  visibility: 'public' | 'members'
  teacherShare?: TeacherShare | null
  holds?: readonly HoldParty[]
}): Availability => {
  const teacherShare = message.teacherShare ?? 'public'
  const blockedBy: Blocker[] = [
    ...(teacherShare === 'none' ? ['teacher' as const] : []),
    ...HOLD_PARTIES.filter(party => message.holds?.includes(party)),
  ]
  const draft = message.status !== 'published'
  if (draft || blockedBy.length) return { audience: 'nobody', blockedBy, draft }
  return { audience: message.visibility === 'members' || teacherShare === 'members' ? 'members' : 'public', blockedBy, draft }
}

// What the screens receive about a message's sharing: who has set what, and the result.
export interface SharingView {
  teacherShare: TeacherShare
  holds: Array<{ party: HoldParty, at: string }>
  availability: Availability
}

// "Paused by the pastor and an administrator", "Not shared by the teacher".
export const blockedSentence = (blockedBy: readonly Blocker[]) => {
  if (!blockedBy.length) return ''
  const names = blockedBy.map(blocker => BLOCKER_LABELS[blocker])
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]!
  return `Paused by ${who}`
}
