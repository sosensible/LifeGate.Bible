// The current photo of a person or of a household.
//
// Photos are set by STAFF, never by the member, and at any time. What the photo
// reaches is decided by the person's sharing choice, not by who may upload: members
// see it only once the person shares it, but the person always sees their own, so
// they can look at it before deciding. The file lives beside the database
// (server/lib/uploads.ts), never in git, never in the public folder, and is served
// only by /api/photos/<name>, which asks the same privacy code the directory uses
// and answers only requests that come from a page of this site.
import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { presentPerson, type Viewer } from '../../shared/privacy.ts'
import { households, people } from '../database/schema/index.ts'
import { db } from './db.ts'
import { loadPeople, loadPerson } from './people.ts'
import { deletePhoto, savePhoto } from './uploads.ts'

export const PHOTO_ROUTE = '/api/photos/'
export const photoUrlOf = (name: string) => `${PHOTO_ROUTE}${name}`
export const photoNameOf = (url: string | null | undefined) => url?.startsWith(PHOTO_ROUTE) ? url.slice(PHOTO_ROUTE.length) : null

// Saves the new file, points the record at it, then removes the old file. Only
// ever one photo: the current one.
const replace = (data: Uint8Array, previous: string | null, point: (url: string) => void) => {
  const name = savePhoto(data)
  try {
    point(photoUrlOf(name))
  }
  catch (error) {
    deletePhoto(name)
    throw error
  }
  deletePhoto(photoNameOf(previous))
  return photoUrlOf(name)
}

export const setPersonPhoto = (personId: string, data: Uint8Array) => {
  const person = loadPerson(personId)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  return replace(data, person.photoUrl, url => db.update(people).set({ photoUrl: url }).where(eq(people.id, personId)).run())
}

export const clearPersonPhoto = (personId: string) => {
  const person = loadPerson(personId)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  db.update(people).set({ photoUrl: null }).where(eq(people.id, personId)).run()
  deletePhoto(photoNameOf(person.photoUrl))
}

const findHousehold = (id: string) => {
  const household = db.select({ photoUrl: households.photoUrl }).from(households).where(eq(households.id, id)).get()
  if (!household) throw createError({ statusCode: 404, statusMessage: 'Household not found' })
  return household
}

export const setHouseholdPhoto = (householdId: string, data: Uint8Array) => {
  const household = findHousehold(householdId)
  return replace(data, household.photoUrl, url => db.update(households).set({ photoUrl: url }).where(eq(households.id, householdId)).run())
}

export const clearHouseholdPhoto = (householdId: string) => {
  const household = findHousehold(householdId)
  db.update(households).set({ photoUrl: null }).where(eq(households.id, householdId)).run()
  deletePhoto(photoNameOf(household.photoUrl))
}

// May this viewer be sent the file called `name`? Answered by the same rules that
// decide what they see on a page, so a photo can never be fetched by address
// when the page would not show it.
//
// - A person's photo: the person themself (always, to look at before sharing), the
//   staff who set it, or anyone the directory shows it to, which means it is shared.
// - A household's photo: staff who keep the household records, a member of that
//   household, or any member who can already see the household, which is to say
//   someone in it has shared their household.
export const canViewPhoto = (viewer: Viewer, mayManageDirectory: boolean, name: string) => {
  const url = photoUrlOf(name)

  const owner = db.select({ id: people.id }).from(people).where(eq(people.photoUrl, url)).get()
  if (owner) {
    const person = loadPerson(owner.id)!
    return mayManageDirectory || viewer.personId === person.id || presentPerson(person, viewer)?.photoUrl === url
  }

  const household = db.select({ id: households.id }).from(households).where(eq(households.photoUrl, url)).get()
  if (household) {
    if (mayManageDirectory) return true
    if (viewer.isMember && viewer.householdId === household.id) return true
    const members = db.select({ id: people.id }).from(people).where(eq(people.householdId, household.id)).all().map(row => row.id)
    return loadPeople(members).some(person => presentPerson(person, viewer)?.householdId === household.id)
  }
  return false
}

// Whether a request for a photo came from a page of this site, as opposed to a
// link pasted elsewhere, another site embedding it, or an address typed in. A
// browser says so itself with `Sec-Fetch-Site`; one that does not is judged by its
// `Referer`. This is on top of signing in and the privacy check, not instead.
export const isFromThisSite = (request: { secFetchSite?: string | null, referer?: string | null, host?: string | null }) => {
  if (request.secFetchSite) return request.secFetchSite === 'same-origin'
  if (!request.referer || !request.host) return false
  try {
    return new URL(request.referer).host === request.host
  }
  catch {
    return false
  }
}
