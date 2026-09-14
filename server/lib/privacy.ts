// What one person may see about another in the directory.
//
// The rules, as decided with the church:
//   - The directory is members-only. The public sees nothing.
//   - Adults' names are visible to members.
//   - Minors are not listed to members.
//   - Contact info (phone, email, address): staff always; members only if
//     the person opted in.
//   - Everything else (birthday, photo, household): opt-in for everyone,
//     staff included.
//
// Hidden fields are OMITTED, never sent as null, so nothing the viewer is not
// allowed to see ever reaches the browser.

export interface Viewer {
  isMember: boolean
  // Holds people:viewContact.
  isStaff: boolean
}

export interface PersonRecord {
  id: string
  firstName: string
  lastName: string
  isMinor: boolean
  phone: string | null
  email: string | null
  address: string | null
  birthday: string | null // YYYY-MM-DD
  photoUrl: string | null
  householdId: string | null
  sharePhone: boolean
  shareEmail: boolean
  shareAddress: boolean
  shareBirthday: boolean
  sharePhoto: boolean
  shareHousehold: boolean
}

export interface DirectoryEntry {
  id: string
  firstName: string
  lastName: string
  phone?: string
  email?: string
  address?: string
  // Month and day only. The year is never shown in the directory.
  birthday?: string // MM-DD
  photoUrl?: string
  householdId?: string
}

export const presentPerson = (person: PersonRecord, viewer: Viewer): DirectoryEntry | null => {
  if (!viewer.isMember && !viewer.isStaff) return null
  if (person.isMinor && !viewer.isStaff) return null

  const entry: DirectoryEntry = {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
  }

  const contactVisible = (optedIn: boolean) => viewer.isStaff || optedIn

  if (person.phone && contactVisible(person.sharePhone)) entry.phone = person.phone
  if (person.email && contactVisible(person.shareEmail)) entry.email = person.email
  if (person.address && contactVisible(person.shareAddress)) entry.address = person.address

  if (person.birthday && person.shareBirthday) entry.birthday = person.birthday.slice(5, 10)
  if (person.photoUrl && person.sharePhoto) entry.photoUrl = person.photoUrl
  if (person.householdId && person.shareHousehold) entry.householdId = person.householdId

  return entry
}
