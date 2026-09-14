// Households: reading them with their members, and saving a structure that
// follows the church's rules (shared/households.ts).
import { eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import {
  householdName,
  householdSortKey,
  type HouseholdInput,
  type HouseholdKind,
  type HouseholdMemberView,
  type HouseholdRole,
  type HouseholdView,
} from '../../shared/households.ts'
import { households, people } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'

type Db = typeof db
type PersonRow = typeof people.$inferSelect

const ADULT_ROLES: HouseholdRole[] = ['husband', 'wife', 'father', 'mother', 'guardian']

const member = (p: PersonRow): HouseholdMemberView => ({
  personId: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  isMinor: p.isMinor,
  role: p.householdRole,
})

// What keeps a household from meeting the rules. Empty means it does.
export const householdProblems = (kind: HouseholdKind, members: PersonRow[]) => {
  const problems: string[] = []
  const count = (...roles: HouseholdRole[]) => members.filter(m => m.householdRole && roles.includes(m.householdRole)).length
  const unassigned = members.filter(m => !m.householdRole)
  const children = count('child')

  if (unassigned.length) problems.push(`No role yet for ${unassigned.map(m => m.firstName).join(', ')}`)
  const minorAdults = members.filter(m => m.isMinor && m.householdRole && ADULT_ROLES.includes(m.householdRole))
  if (minorAdults.length) problems.push(`${minorAdults.map(m => m.firstName).join(', ')} is marked under 18`)

  if (kind === 'married') {
    if (count('husband') !== 1) problems.push('Needs a husband')
    if (count('wife') !== 1) problems.push('Needs a wife')
    if (count('father', 'mother', 'guardian')) problems.push('A married household has a husband and wife')
  }
  else if (kind === 'singleParent') {
    if (count('father', 'mother', 'guardian') !== 1) problems.push('Needs one father, mother or guardian')
    if (count('husband', 'wife')) problems.push('A single-parent household has no husband or wife')
    if (!children) problems.push('Needs at least one child')
  }
  else {
    if (count('guardian') !== 2) problems.push('Needs two guardians')
    if (count('husband', 'wife', 'father', 'mother')) problems.push('A guardians household has only guardians')
    if (!children) problems.push('Needs at least one child')
  }
  return problems
}

export const loadHouseholds = (ids?: string[]): HouseholdView[] => {
  const rows = db.select().from(households).where(ids ? inArray(households.id, ids) : undefined).all()
  if (!rows.length) return []
  const members = db.select().from(people).where(inArray(people.householdId, rows.map(r => r.id))).all()

  return rows
    .map((household) => {
      const mine = members.filter(m => m.householdId === household.id)
      const adults = mine.filter(m => m.householdRole && ADULT_ROLES.includes(m.householdRole)).map(member)
      const children = mine.filter(m => !m.householdRole || m.householdRole === 'child').map(member)
        .sort((a, b) => a.firstName.localeCompare(b.firstName))
      return {
        view: {
          id: household.id,
          kind: household.kind,
          relationship: household.relationship,
          name: household.name,
          nameIsCustom: household.nameIsCustom,
          adults,
          children,
          problems: householdProblems(household.kind, mine),
        },
        sortKey: householdSortKey(household.kind, adults.length ? adults : children),
      }
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.view.name.localeCompare(b.view.name))
    .map(({ view }) => view)
}

export const loadHousehold = (id: string) => loadHouseholds([id])[0]

// Who runs the house, with their roles, for an input.
const adultsOf = (input: HouseholdInput): Array<{ personId: string, role: HouseholdRole }> => {
  if (input.kind === 'married') return [{ personId: input.husbandId, role: 'husband' }, { personId: input.wifeId, role: 'wife' }]
  if (input.kind === 'singleParent') return [{ personId: input.adultId, role: input.role }]
  return input.guardianIds.map(personId => ({ personId, role: 'guardian' as const }))
}

// Validate and write a household's structure. Returns its id.
export const saveHousehold = (tx: Tx, id: string | null, input: HouseholdInput) => {
  const adults = adultsOf(input)
  const everyone = [...adults.map(a => a.personId), ...input.childIds]

  if (new Set(everyone).size !== everyone.length) {
    throw createError({ statusCode: 400, statusMessage: 'Each person can appear only once in a household' })
  }

  const found = tx.select().from(people).where(inArray(people.id, everyone)).all()
  if (found.length !== everyone.length) {
    throw createError({ statusCode: 400, statusMessage: 'One of those people no longer exists' })
  }
  const byId = new Map(found.map(p => [p.id, p]))

  const guest = found.find(p => p.kind === 'guest')
  if (guest) {
    throw createError({ statusCode: 400, statusMessage: `${guest.firstName} ${guest.lastName} is a guest, not a church member, so cannot be in a household` })
  }

  for (const adult of adults) {
    const person = byId.get(adult.personId)!
    if (person.isMinor) {
      throw createError({ statusCode: 400, statusMessage: `${person.firstName} ${person.lastName} is marked under 18, so cannot be a ${adult.role}` })
    }
  }

  const elsewhere = found.find(p => p.householdId && p.householdId !== id)
  if (elsewhere) {
    const other = tx.select({ name: households.name }).from(households).where(eq(households.id, elsewhere.householdId!)).get()
    throw createError({ statusCode: 409, statusMessage: `${elsewhere.firstName} ${elsewhere.lastName} already belongs to ${other?.name ?? 'another household'}` })
  }

  const generated = householdName(input.kind, adults.map(a => ({ ...byId.get(a.personId)!, role: a.role })))
  const custom = input.customName?.trim() || null
  const relationship = input.kind === 'married'
    ? input.relationship
    : input.kind === 'singleParent' && input.role !== 'guardian' ? 'family' : 'guardian'
  const values = { kind: input.kind, relationship, name: custom ?? generated, nameIsCustom: custom !== null }

  const householdId = id
    ? (tx.update(households).set(values).where(eq(households.id, id)).run(), id)
    : tx.insert(households).values(values).returning({ id: households.id }).get().id

  // Replace the membership: clear everyone who was in it, then assign.
  tx.update(people).set({ householdId: null, householdRole: null }).where(eq(people.householdId, householdId)).run()
  for (const adult of adults) {
    tx.update(people).set({ householdId, householdRole: adult.role }).where(eq(people.id, adult.personId)).run()
  }
  if (input.childIds.length) {
    tx.update(people).set({ householdId, householdRole: 'child' }).where(inArray(people.id, input.childIds)).run()
  }

  return householdId
}

// After an adult's name changes, rebuild the household name unless it is custom.
export const refreshHouseholdName = (tx: Tx | Db, householdId: string | null) => {
  if (!householdId) return
  const household = tx.select().from(households).where(eq(households.id, householdId)).get()
  if (!household || household.nameIsCustom) return
  const members = tx.select().from(people).where(eq(people.householdId, householdId)).all()
  if (householdProblems(household.kind, members).length) return
  const adults = members.filter(m => m.householdRole && ADULT_ROLES.includes(m.householdRole))
  const name = householdName(household.kind, adults.map(a => ({ ...a, role: a.householdRole! })))
  if (name !== household.name) tx.update(households).set({ name }).where(eq(households.id, householdId)).run()
}

export const deleteHousehold = (tx: Tx, id: string) => {
  tx.update(people).set({ householdId: null, householdRole: null }).where(eq(people.householdId, id)).run()
  return tx.delete(households).where(eq(households.id, id)).returning({ id: households.id }).get()
}
