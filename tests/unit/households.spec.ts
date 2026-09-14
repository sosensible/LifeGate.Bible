// Household rules against a real, throwaway SQLite database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { householdName, householdSchema, householdSummary } from '../../shared/households'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-households-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let lib: typeof import('../../server/lib/households')
let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
const ids: Record<string, string> = {}

const addPerson = (key: string, firstName: string, lastName: string, isMinor = false) => {
  ids[key] = db.insert(schema.people).values({ firstName, lastName, isMinor }).returning().get().id
}

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/households')

  addPerson('james', 'James', 'Mitchell')
  addPerson('sarah', 'Sarah', 'Mitchell')
  addPerson('emma', 'Emma', 'Mitchell', true)
  addPerson('helen', 'Helen', 'Johnson')
  addPerson('lucas', 'Lucas', 'Johnson', true)
  addPerson('tom', 'Tom', 'Adams')
  addPerson('alice', 'Alice', 'Baker')
  addPerson('ruth', 'Ruth', 'Carter')
  addPerson('naomi', 'Naomi', 'Carter')
  addPerson('ben', 'Ben', 'Doe', true)
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const eqId = (id: string | undefined) => eq(schema.people.id, id!)
const save = (id: string | null, input: unknown) =>
  db.transaction(tx => lib.saveHousehold(tx, id, householdSchema.parse(input)))

describe('household names', () => {
  it('names adults by first name in alphabetical order, then the household last name', () => {
    expect(householdName('married', [{ firstName: 'James', lastName: 'Mitchell', role: 'husband' }, { firstName: 'Sarah', lastName: 'Mitchell', role: 'wife' }]))
      .toBe('James & Sarah Mitchell Household')
    expect(householdName('married', [{ firstName: 'Tom', lastName: 'Adams', role: 'husband' }, { firstName: 'Alice', lastName: 'Baker', role: 'wife' }]))
      .toBe('Alice & Tom Adams Household')
    expect(householdName('singleParent', [{ firstName: 'Helen', lastName: 'Johnson', role: 'mother' }])).toBe('Helen Johnson Household')
    expect(householdName('guardians', [{ firstName: 'Ruth', lastName: 'Carter', role: 'guardian' }, { firstName: 'Naomi', lastName: 'Carter', role: 'guardian' }]))
      .toBe('Naomi & Ruth Carter Household')
  })

  it('summarises who runs the house', () => {
    expect(householdSummary('married', 'family', [])).toBe('Married couple · Parents')
    expect(householdSummary('married', 'guardian', [])).toBe('Married couple · Guardians')
    expect(householdSummary('singleParent', 'family', [{ role: 'mother' }])).toBe('Mother')
    expect(householdSummary('guardians', 'guardian', [])).toBe('Two guardians')
  })
})

describe('household rules', () => {
  it('requires a child for a single parent or two guardians, but not a married couple', () => {
    expect(householdSchema.safeParse({ kind: 'singleParent', adultId: 'x', role: 'mother', childIds: [], customName: null }).success).toBe(false)
    expect(householdSchema.safeParse({ kind: 'guardians', guardianIds: ['x', 'y'], childIds: [], customName: null }).success).toBe(false)
    expect(householdSchema.safeParse({ kind: 'married', husbandId: 'x', wifeId: 'y', relationship: 'family', childIds: [], customName: null }).success).toBe(true)
  })

  it('asks a single adult to be father, mother or guardian', () => {
    expect(householdSchema.safeParse({ kind: 'singleParent', adultId: 'x', role: 'husband', childIds: ['y'], customName: null }).success).toBe(false)
  })

  it('creates a married household of parents, with roles and the generated name', () => {
    const id = save(null, { kind: 'married', husbandId: ids.james, wifeId: ids.sarah, relationship: 'family', childIds: [ids.emma], customName: null })
    const household = lib.loadHousehold(id)!
    expect(household).toMatchObject({ name: 'James & Sarah Mitchell Household', kind: 'married', relationship: 'family', problems: [] })
    expect(household.adults.map(a => a.role).sort()).toEqual(['husband', 'wife'])
    expect(household.children.map(c => [c.firstName, c.role])).toEqual([['Emma', 'child']])
  })

  it('records a married couple who are guardians, and two guardians', () => {
    const foster = save(null, { kind: 'married', husbandId: ids.tom, wifeId: ids.alice, relationship: 'guardian', childIds: [ids.ben], customName: null })
    expect(lib.loadHousehold(foster)).toMatchObject({ relationship: 'guardian', problems: [] })

    db.transaction(tx => lib.deleteHousehold(tx, foster))
    const guardians = save(null, { kind: 'guardians', guardianIds: [ids.ruth, ids.naomi], childIds: [ids.ben], customName: null })
    const household = lib.loadHousehold(guardians)!
    expect(household).toMatchObject({ name: 'Naomi & Ruth Carter Household', relationship: 'guardian', problems: [] })
    expect(household.adults.map(a => a.role)).toEqual(['guardian', 'guardian'])
  })

  it('refuses a person who already belongs to another household', () => {
    expect(() => save(null, { kind: 'singleParent', adultId: ids.helen, role: 'guardian', childIds: [ids.emma], customName: null }))
      .toThrow(/already belongs to James & Sarah Mitchell Household/)
  })

  it('refuses a minor running the house, and the same person twice', () => {
    expect(() => save(null, { kind: 'singleParent', adultId: ids.lucas, role: 'father', childIds: [ids.helen], customName: null }))
      .toThrow(/under 18/)
    expect(() => save(null, { kind: 'guardians', guardianIds: [ids.helen, ids.helen], childIds: [ids.lucas], customName: null }))
      .toThrow(/only once/)
  })

  it('refuses a guest, who is not a church member', () => {
    const guest = db.insert(schema.people).values({ firstName: 'Daniel', lastName: 'Brooks', kind: 'guest', isSpeaker: true }).returning().get().id
    expect(() => save(null, { kind: 'singleParent', adultId: guest, role: 'father', childIds: [ids.ben], customName: null }))
      .toThrow(/is a guest/)
  })

  it('keeps a custom name, and replaces the structure on edit', () => {
    const id = save(null, { kind: 'singleParent', adultId: ids.helen, role: 'mother', childIds: [ids.lucas], customName: 'The Johnsons' })
    expect(lib.loadHousehold(id)!.name).toBe('The Johnsons')

    save(id, { kind: 'singleParent', adultId: ids.helen, role: 'guardian', childIds: [ids.lucas], customName: null })
    const edited = lib.loadHousehold(id)!
    expect(edited).toMatchObject({ name: 'Helen Johnson Household', relationship: 'guardian' })
    expect(edited.adults[0]!.role).toBe('guardian')
  })

  it('lists households by last name, then first names', () => {
    expect(lib.loadHouseholds().map(h => h.name)).toEqual([
      'Naomi & Ruth Carter Household',
      'Helen Johnson Household',
      'James & Sarah Mitchell Household',
    ])
  })

  it('flags a household that no longer meets the rules, and deleting keeps its people', () => {
    const mitchell = lib.loadHouseholds().find(h => h.name.includes('Mitchell'))!
    db.transaction(tx => tx.update(schema.people).set({ householdId: null, householdRole: null }).where(eqId(ids.sarah)).run())
    expect(lib.loadHousehold(mitchell.id)!.problems).toContain('Needs a wife')

    db.transaction(tx => lib.deleteHousehold(tx, mitchell.id))
    expect(db.select().from(schema.people).where(eqId(ids.james)).get()).toMatchObject({ householdId: null, householdRole: null })
  })
})
