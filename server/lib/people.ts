// Reading and writing directory records.
import { asc, eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import type { AdminPersonView } from '../../shared/people.ts'
import type { PersonRecord } from '../../shared/privacy.ts'
import { households, ministries, ministryMembers, people, user } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'

export type PersonRow = typeof people.$inferSelect

export interface FullPerson extends PersonRecord {
  title: string | null
  householdName: string | null
  ministries: Array<{ id: string, slug: string, name: string }>
  userId: string | null
  account: { email: string, role: string | null } | null
}

// Every person (or the ids given), with household, ministries and linked
// account, ordered by last name. The caller decides what anyone may see.
export const loadPeople = (ids?: string[]): FullPerson[] => {
  const rows = db
    .select({ person: people, householdName: households.name, accountEmail: user.email, accountRole: user.role })
    .from(people)
    .leftJoin(households, eq(people.householdId, households.id))
    .leftJoin(user, eq(people.userId, user.id))
    .where(ids ? inArray(people.id, ids) : undefined)
    .orderBy(asc(people.lastName), asc(people.firstName))
    .all()

  if (rows.length === 0) return []

  const service = db
    .select({ personId: ministryMembers.personId, id: ministries.id, slug: ministries.slug, name: ministries.name })
    .from(ministryMembers)
    .innerJoin(ministries, eq(ministryMembers.ministryId, ministries.id))
    .where(inArray(ministryMembers.personId, rows.map(row => row.person.id)))
    .orderBy(asc(ministries.name))
    .all()

  return rows.map(({ person, householdName, accountEmail, accountRole }) => ({
    ...person,
    householdName,
    ministries: service
      .filter(entry => entry.personId === person.id)
      .map(({ id, slug, name }) => ({ id, slug, name })),
    account: accountEmail ? { email: accountEmail, role: accountRole } : null,
  }))
}

export const loadPerson = (id: string): FullPerson | undefined => loadPeople([id])[0]

// A record as the people admin sees it. Staff keep records, so they see names,
// contact info, household and ministries. Birthday and photo stay opt-in even
// here: staff neither see nor change them until the person shares them.
export const presentForAdmin = (person: FullPerson): AdminPersonView => ({
  id: person.id,
  firstName: person.firstName,
  lastName: person.lastName,
  title: person.title,
  isMinor: person.isMinor,
  phone: person.phone,
  email: person.email,
  address: person.address,
  householdId: person.householdId,
  householdName: person.householdName,
  ministries: person.ministries,
  birthday: person.shareBirthday ? person.birthday : null,
  photoUrl: person.sharePhoto ? person.photoUrl : null,
  sharePhone: person.sharePhone,
  shareEmail: person.shareEmail,
  shareAddress: person.shareAddress,
  shareBirthday: person.shareBirthday,
  sharePhoto: person.sharePhoto,
  shareHousehold: person.shareHousehold,
  account: person.account,
})

export const findPersonByUserId = (userId: string) =>
  db.select({ id: people.id }).from(people).where(eq(people.userId, userId)).get()

// Nobody may change what they cannot see. Staff see a birthday only once the
// person shares it; until then only the person can set or change it.
export const assertStaffCanReview = (person: Pick<PersonRecord, 'firstName' | 'shareBirthday'>, fields: string[]) => {
  if (fields.includes('birthday') && !person.shareBirthday) {
    throw createError({
      statusCode: 403,
      statusMessage: `${person.firstName} has not shared a birthday, so only they can change it from their profile`,
    })
  }
}

// A clear 400 instead of a foreign-key failure when a form sends a stale id.
export const assertReferencesExist = (values: { householdId?: string | null, ministryIds?: string[] }) => {
  if (values.householdId) {
    const found = db.select({ id: households.id }).from(households).where(eq(households.id, values.householdId)).get()
    if (!found) throw createError({ statusCode: 400, statusMessage: 'That household no longer exists' })
  }
  if (values.ministryIds?.length) {
    const unique = [...new Set(values.ministryIds)]
    const found = db.select({ id: ministries.id }).from(ministries).where(inArray(ministries.id, unique)).all()
    if (found.length !== unique.length) throw createError({ statusCode: 400, statusMessage: 'One of those ministries no longer exists' })
  }
}

// Replace the set of ministries a person serves in.
export const setMinistries = (tx: Tx, personId: string, ministryIds: string[]) => {
  tx.delete(ministryMembers).where(eq(ministryMembers.personId, personId)).run()
  const unique = [...new Set(ministryIds)]
  if (unique.length) {
    tx.insert(ministryMembers).values(unique.map(ministryId => ({ ministryId, personId }))).run()
  }
}

export { recordAudit } from './audit.ts'
