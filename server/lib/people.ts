// Reading and writing directory records.
import { and, asc, eq, inArray } from 'drizzle-orm'
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
  householdRole: PersonRow['householdRole']
  kind: PersonRow['kind']
  isSpeaker: boolean
  speakerArchivedAt: Date | null
  ministries: Array<{ id: string, slug: string, name: string, isLeader: boolean, showToMembers: boolean, showPublicly: boolean }>
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
    .select({
      personId: ministryMembers.personId,
      id: ministries.id,
      slug: ministries.slug,
      name: ministries.name,
      isLeader: ministryMembers.isLeader,
      showToMembers: ministryMembers.showToMembers,
      showPublicly: ministryMembers.showPublicly,
    })
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
      .map(({ personId: _, ...ministry }) => ministry),
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
  kind: person.kind,
  isSpeaker: person.isSpeaker,
  phone: person.phone,
  email: person.email,
  address: person.address,
  householdId: person.householdId,
  householdName: person.householdName,
  householdRole: person.householdRole,
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
export const assertReferencesExist = (values: { ministryIds?: string[], leaderMinistryIds?: string[] }) => {
  if (values.leaderMinistryIds?.some(id => !values.ministryIds?.includes(id))) {
    throw createError({ statusCode: 400, statusMessage: 'A leader must also serve in that ministry' })
  }
  if (values.ministryIds?.length) {
    const unique = [...new Set(values.ministryIds)]
    const found = db.select({ id: ministries.id }).from(ministries).where(inArray(ministries.id, unique)).all()
    if (found.length !== unique.length) throw createError({ statusCode: 400, statusMessage: 'One of those ministries no longer exists' })
  }
}

// Replace the set of ministries a person serves in, and which they lead.
// The person's own roster choices are kept for ministries they still serve in.
export const setMinistries = (tx: Tx, personId: string, ministryIds: string[], leaderMinistryIds: string[] = []) => {
  const wanted = new Set(ministryIds)
  const leads = new Set(leaderMinistryIds)
  const current = tx.select({ ministryId: ministryMembers.ministryId }).from(ministryMembers).where(eq(ministryMembers.personId, personId)).all()
  const kept = new Set(current.map(row => row.ministryId).filter(id => wanted.has(id)))

  const gone = current.map(row => row.ministryId).filter(id => !wanted.has(id))
  if (gone.length) {
    tx.delete(ministryMembers).where(and(eq(ministryMembers.personId, personId), inArray(ministryMembers.ministryId, gone))).run()
  }
  for (const ministryId of kept) {
    tx.update(ministryMembers).set({ isLeader: leads.has(ministryId) })
      .where(and(eq(ministryMembers.personId, personId), eq(ministryMembers.ministryId, ministryId))).run()
  }
  const added = [...wanted].filter(id => !kept.has(id))
  if (added.length) {
    tx.insert(ministryMembers).values(added.map(ministryId => ({ ministryId, personId, isLeader: leads.has(ministryId) }))).run()
  }
}

// A person's own roster choices. Only ministries they serve in are changed, and
// being shown publicly requires being shown to members.
export const setRosterChoices = (tx: Tx, personId: string, choices: Array<{ ministryId: string, showToMembers: boolean, showPublicly: boolean }>) => {
  for (const { ministryId, showToMembers, showPublicly } of choices) {
    tx.update(ministryMembers).set({ showToMembers, showPublicly: showToMembers && showPublicly })
      .where(and(eq(ministryMembers.personId, personId), eq(ministryMembers.ministryId, ministryId))).run()
  }
}

export { recordAudit } from './audit.ts'
