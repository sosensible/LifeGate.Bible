// Households, as the church defines them: who runs the house, and whether they
// are the children's family (father and mother) or their guardians (foster
// care, grandparents and so on). Children are listed; nothing more is recorded
// about them.
//
//   married       husband and wife; family (father and mother) or guardians.
//                 Children are optional.
//   singleParent  one adult who is the children's father, mother or guardian.
//   guardians     two adults who are the children's guardians.
//   A single parent or guardians need at least one child. A single adult with
//   no children is not a household.
//
// Names are built from the adults' first names in alphabetical order, e.g.
// "James & Sarah Mitchell Household", and can be replaced with a custom name.
// Households are listed by last name, then those first names.
import { z } from 'zod'

export const HOUSEHOLD_KINDS = ['married', 'singleParent', 'guardians'] as const
export type HouseholdKind = typeof HOUSEHOLD_KINDS[number]

export const HOUSEHOLD_RELATIONSHIPS = ['family', 'guardian'] as const
export type HouseholdRelationship = typeof HOUSEHOLD_RELATIONSHIPS[number]

export const HOUSEHOLD_ROLES = ['husband', 'wife', 'father', 'mother', 'guardian', 'child'] as const
export type HouseholdRole = typeof HOUSEHOLD_ROLES[number]

export const HOUSEHOLD_KIND_LABELS: Record<HouseholdKind, string> = {
  married: 'Married couple',
  singleParent: 'Single parent or guardian',
  guardians: 'Two guardians',
}

export const HOUSEHOLD_ROLE_LABELS: Record<HouseholdRole, string> = {
  husband: 'Husband',
  wife: 'Wife',
  father: 'Father',
  mother: 'Mother',
  guardian: 'Guardian',
  child: 'Child',
}

// "Married couple · Parents", "Mother", "Two guardians".
export const householdSummary = (kind: HouseholdKind, relationship: HouseholdRelationship, adults: Array<{ role: HouseholdRole | null }>) => {
  if (kind === 'married') return `Married couple · ${relationship === 'guardian' ? 'Guardians' : 'Parents'}`
  if (kind === 'guardians') return 'Two guardians'
  return HOUSEHOLD_ROLE_LABELS[adults[0]?.role ?? 'guardian']
}

const personId = z.string().min(1, 'Choose a person')
const childIds = z.array(personId).max(30)
const customName = z.string().trim().max(120).nullable()

export const householdSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('married'),
    husbandId: personId,
    wifeId: personId,
    relationship: z.enum(HOUSEHOLD_RELATIONSHIPS),
    childIds,
    customName,
  }),
  z.object({
    kind: z.literal('singleParent'),
    adultId: personId,
    // How the adult is related to the children.
    role: z.enum(['father', 'mother', 'guardian'], 'Choose father, mother or guardian'),
    childIds: childIds.min(1, 'Add at least one child'),
    customName,
  }),
  z.object({
    kind: z.literal('guardians'),
    guardianIds: z.tuple([personId, personId]),
    childIds: childIds.min(1, 'Add at least one child'),
    customName,
  }),
])

export type HouseholdInput = z.infer<typeof householdSchema>

interface NamedPerson { firstName: string, lastName: string }

const byFirstName = (a: NamedPerson, b: NamedPerson) => a.firstName.localeCompare(b.firstName)

// The last name a household goes by: the husband's, the single adult's, or for
// two guardians the one listed first (alphabetical by first name). A household
// still being set up falls back to its first member.
const householdLastName = (kind: HouseholdKind, adults: Array<NamedPerson & { role?: HouseholdRole | null }>) =>
  ((kind === 'married' && adults.find(a => a.role === 'husband')) || [...adults].sort(byFirstName)[0])?.lastName ?? ''

// "James & Sarah Mitchell Household", "Helen Johnson Household".
export const householdName = (kind: HouseholdKind, adults: Array<NamedPerson & { role?: HouseholdRole | null }>) => {
  const firstNames = [...adults].sort(byFirstName).map(a => a.firstName).join(' & ')
  return `${firstNames} ${householdLastName(kind, adults)} Household`
}

// Sort key for listing households: last name, then the adults' first names.
export const householdSortKey = (kind: HouseholdKind, adults: Array<NamedPerson & { role?: HouseholdRole | null }>) =>
  `${householdLastName(kind, adults)} ${[...adults].sort(byFirstName).map(a => a.firstName).join(' ')}`.toLowerCase()

export interface HouseholdMemberView {
  personId: string
  firstName: string
  lastName: string
  isMinor: boolean
  role: HouseholdRole | null
}

export interface HouseholdView {
  id: string
  kind: HouseholdKind
  relationship: HouseholdRelationship
  name: string
  nameIsCustom: boolean
  adults: HouseholdMemberView[]
  children: HouseholdMemberView[]
  // Why the household does not meet the rules yet (e.g. created before them).
  problems: string[]
}
