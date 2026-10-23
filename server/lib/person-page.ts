// The member page: who may open whose, and what it shows. See
// docs/specs/member-page.md.
//
// Everyone's page is built by the directory's own presenter, so it can never show
// more than the directory does. The owner's private sections are not built here at
// all: they come from endpoints that answer only for the signed-in person.
import { eq } from 'drizzle-orm'
import type { PersonMessage, PersonPageView } from '../../shared/person-page.ts'
import { presentPerson, type DirectoryEntry, type Viewer } from '../../shared/privacy.ts'
import { households } from '../database/schema/index.ts'
import { db } from './db.ts'
import { canViewSermon, loadSermons } from './sermons.ts'
import { loadPerson, type FullPerson } from './people.ts'

// Your own record, whole: people always see all of their own information. Only
// the others' view of it is filtered.
export const presentOwn = (person: FullPerson): DirectoryEntry => ({
  id: person.id,
  firstName: person.firstName,
  lastName: person.lastName,
  ...(person.title ? { title: person.title } : {}),
  ...(person.phone ? { phone: person.phone } : {}),
  ...(person.email ? { email: person.email } : {}),
  ...(person.address ? { address: person.address } : {}),
  ...(person.birthday ? { birthday: person.birthday.slice(5, 10) } : {}),
  ...(person.photoUrl ? { photoUrl: person.photoUrl } : {}),
  ...(person.householdName ? { householdName: person.householdName } : {}),
})

// A guest has a page only while they are on the Speakers list; otherwise the
// church just keeps a record, and the record is not for members to find.
const isListedGuest = (person: FullPerson) => person.kind === 'guest' && person.isSpeaker && !person.speakerArchivedAt

// The page for `id` as this viewer may see it, or null: not found, not allowed, or
// a minor this viewer may not see. The caller answers all three with a 404, so
// nobody can tell which, and whether a minor is in the directory at all.
export const loadPersonPage = (viewer: Viewer, id: string): PersonPageView | null => {
  const person = loadPerson(id)
  if (!person) return null
  const isSelf = Boolean(viewer.personId) && viewer.personId === person.id
  if (person.kind === 'guest' && !isSelf && !isListedGuest(person)) return null

  const entry = isSelf ? presentOwn(person) : presentPerson(person, viewer)
  if (!entry) return null

  // Others see the ministries the person chose to show; the person sees all of theirs.
  const ministries = (isSelf ? person.ministries : entry.ministries ?? []).map(m => ({ slug: m.slug, name: m.name, isLeader: Boolean(m.isLeader) }))

  // Published messages only: a draft is its teacher's to see, on My teaching.
  const messages: PersonMessage[] = loadSermons()
    .filter(sermon => sermon.speakerPersonId === person.id && sermon.status === 'published' && canViewSermon(sermon, { isMember: viewer.isMember, canManage: false }))
    .map(sermon => ({
      id: sermon.id,
      slug: sermon.slug,
      title: sermon.title,
      preachedOn: sermon.preachedOn,
      series: sermon.seriesId && sermon.seriesName ? { id: sermon.seriesId, name: sermon.seriesName } : null,
      scripture: sermon.scripture,
      visibility: sermon.visibility,
    }))

  // The household's photo goes only where the household is shown: through a person
  // who shares it, or to its own members. Never on its own.
  const householdId = isSelf ? person.householdId : entry.householdId
  const householdPhotoUrl = householdId
    ? db.select({ photoUrl: households.photoUrl }).from(households).where(eq(households.id, householdId)).get()?.photoUrl
    : null

  return {
    id: person.id,
    firstName: entry.firstName,
    lastName: entry.lastName,
    ...(entry.title ? { title: entry.title } : {}),
    kind: person.kind,
    isMinor: person.isMinor,
    isSpeaker: person.isSpeaker,
    isSelf,
    ...(entry.photoUrl ? { photoUrl: entry.photoUrl } : {}),
    ...(entry.phone ? { phone: entry.phone } : {}),
    ...(entry.email ? { email: entry.email } : {}),
    ...(entry.address ? { address: entry.address } : {}),
    ...(entry.birthday ? { birthday: entry.birthday } : {}),
    ...(entry.householdName ? { householdName: entry.householdName } : {}),
    ...(householdPhotoUrl ? { householdPhotoUrl } : {}),
    ministries,
    messages,
    ...(isSelf
      ? { sharing: { phone: person.sharePhone, email: person.shareEmail, address: person.shareAddress, birthday: person.shareBirthday, photo: person.sharePhoto, household: person.shareHousehold } }
      : {}),
  }
}
