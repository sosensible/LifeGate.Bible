// Account safeguards against a real, throwaway SQLite database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { needsDirectoryEntry, splitAccountName } from '../../shared/accounts'
import { parseRoles, permissionLabels } from '../../shared/auth/role-info'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-accounts-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let lib: typeof import('../../server/lib/accounts')
let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let orm: typeof import('drizzle-orm')

const addUser = (id: string, role: string, banned = false) => {
  const now = new Date()
  db.insert(schema.user).values({ id, name: id, email: `${id}@example.org`, emailVerified: true, role, banned, createdAt: now, updatedAt: now }).run()
}

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/accounts')
  orm = await import('drizzle-orm')

  addUser('only-admin', 'admin,member')
  addUser('editor', 'member,contentEditor')
  addUser('blocked-admin', 'admin', true)
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('roles', () => {
  it('reads stored roles, treating `user` and unknown names as no role', () => {
    expect(parseRoles('member, admin')).toEqual(['member', 'admin'])
    expect(parseRoles('user')).toEqual([])
    expect(parseRoles('member,searchCommittee')).toEqual(['member'])
    expect(parseRoles(null)).toEqual([])
  })

  it('stores an account with no roles as `user`', () => {
    expect(lib.storedRoles([])).toEqual(['user'])
    expect(lib.storedRoles(['member', 'member'])).toEqual(['member'])
  })

  it('describes what a role can do', () => {
    expect(permissionLabels('member')).toEqual(['Member area', 'Directory'])
    expect(permissionLabels('admin')).toContain('Audit log')
  })
})

describe('account safeguards', () => {
  const account = (id: string) => lib.loadAccount(id)!

  it('refuses to block, delete or demote yourself', () => {
    expect(() => lib.assertSafeAccountChange('only-admin', account('only-admin'), { kind: 'block' })).toThrow(/own account/)
    expect(() => lib.assertSafeAccountChange('only-admin', account('only-admin'), { kind: 'delete' })).toThrow(/own account/)
    expect(() => lib.assertSafeAccountChange('only-admin', account('only-admin'), { kind: 'roles', roles: ['member'] })).toThrow(/your own administrator/)
  })

  it('never leaves the church without an active administrator (a blocked one does not count)', () => {
    expect(() => lib.assertSafeAccountChange('editor', account('only-admin'), { kind: 'roles', roles: ['member'] })).toThrow(/only active administrator/)
    expect(() => lib.assertSafeAccountChange('editor', account('only-admin'), { kind: 'block' })).toThrow(/only active administrator/)
    expect(() => lib.assertSafeAccountChange('editor', account('only-admin'), { kind: 'delete' })).toThrow(/only active administrator/)
  })

  it('allows the change once another administrator exists', () => {
    addUser('second-admin', 'admin')
    expect(() => lib.assertSafeAccountChange('second-admin', account('only-admin'), { kind: 'roles', roles: ['member'] })).not.toThrow()
  })

  it('allows ordinary changes to other accounts', () => {
    expect(() => lib.assertSafeAccountChange('only-admin', account('editor'), { kind: 'roles', roles: [] })).not.toThrow()
    expect(() => lib.assertSafeAccountChange('only-admin', account('editor'), { kind: 'block' })).not.toThrow()
    expect(() => lib.assertSafeAccountChange('only-admin', account('only-admin'), { kind: 'roles', roles: ['admin'] })).not.toThrow()
  })
})

describe('connecting accounts to directory entries', () => {
  const addPerson = (firstName: string) => db.insert(schema.people).values({ firstName, lastName: 'Linkson' }).returning().get().id
  const links = () => db.select().from(schema.auditLog).all().filter(e => e.action.startsWith('account.'))

  it('connects an account, flags member logins with none, and lists only people without access', () => {
    addUser('new-member', 'member')
    addUser('treasurer-only', 'treasurer')
    const ruth = addPerson('Ruth')
    const amos = addPerson('Amos')

    expect(needsDirectoryEntry(lib.loadAccount('new-member')!)).toBe(true)
    // Not a member login: nothing to flag.
    expect(needsDirectoryEntry(lib.loadAccount('treasurer-only')!)).toBe(false)

    lib.assertCanLink(ruth, 'new-member')
    db.transaction(tx => lib.linkAccount(tx, 'only-admin', ruth, 'new-member'))

    expect(lib.loadAccount('new-member')!.person).toMatchObject({ id: ruth, firstName: 'Ruth' })
    expect(needsDirectoryEntry(lib.loadAccount('new-member')!)).toBe(false)
    expect(lib.loadUnlinkedPeople().map(p => p.id)).toContain(amos)
    expect(lib.loadUnlinkedPeople().map(p => p.id)).not.toContain(ruth)
    expect(links().at(-1)).toMatchObject({ action: 'account.link', entityType: 'person', entityId: ruth, actorUserId: 'only-admin' })
  })

  it('keeps one account per person and one person per account', () => {
    const ruth = lib.loadAccount('new-member')!.person!.id
    const amos = lib.loadUnlinkedPeople().find(p => p.firstName === 'Amos')!.id
    expect(() => lib.assertCanLink(ruth, 'editor')).toThrow(/already has sign-in access/)
    expect(() => lib.assertCanLink(amos, 'new-member')).toThrow(/already connected to another directory entry/)
    expect(() => lib.assertCanLink('no-such-person', 'editor')).toThrow(/Person not found/)
    // Before an account exists, only the person is checked.
    expect(() => lib.assertCanLink(amos)).not.toThrow()
  })

  it('disconnects, keeping both the account and the person', () => {
    const ruth = lib.loadAccount('new-member')!.person!.id
    db.transaction(tx => lib.unlinkAccount(tx, 'only-admin', ruth))
    expect(lib.loadAccount('new-member')!.person).toBeNull()
    expect(lib.loadUnlinkedPeople().map(p => p.id)).toContain(ruth)
    expect(links().at(-1)).toMatchObject({ action: 'account.unlink', entityId: ruth })
  })
})

describe('a directory entry made from an account', () => {
  const named = (id: string, name: string, role = 'member') => {
    const now = new Date()
    db.insert(schema.user).values({ id, name, email: `${id}@example.org`, emailVerified: true, role, createdAt: now, updatedAt: now }).run()
  }

  it('splits an account name at its last word, and does not guess from a single word', () => {
    expect(splitAccountName('Jane Public')).toEqual({ firstName: 'Jane', lastName: 'Public' })
    expect(splitAccountName('  Mary  Ann   Smith ')).toEqual({ firstName: 'Mary Ann', lastName: 'Smith' })
    expect(splitAccountName('Cher')).toBeNull()
    expect(splitAccountName('   ')).toBeNull()
  })

  it('creates the entry from the account’s name and email, and connects them', () => {
    named('make-entry', 'Grace Hopper')
    const personId = db.transaction(tx => lib.createDirectoryEntry(tx, 'only-admin', 'make-entry'))
    const person = db.select().from(schema.people).where(orm.eq(schema.people.id, personId)).get()!
    expect(person).toMatchObject({ firstName: 'Grace', lastName: 'Hopper', email: 'make-entry@example.org', userId: 'make-entry', kind: 'member', isMinor: false })
    expect(lib.loadAccount('make-entry')!.person).toMatchObject({ id: personId, firstName: 'Grace' })
    expect(needsDirectoryEntry(lib.loadAccount('make-entry')!)).toBe(false)
    const actions = db.select().from(schema.auditLog).all().filter(e => e.entityId === personId).map(e => e.action)
    expect(actions).toEqual(expect.arrayContaining(['person.create', 'account.link']))
  })

  it('shares nothing it was not told: the new entry starts with everything private', () => {
    const person = db.select().from(schema.people).where(orm.eq(schema.people.userId, 'make-entry')).get()!
    expect(person).toMatchObject({ shareEmail: false, sharePhone: false, shareAddress: false, shareBirthday: false, sharePhoto: false, shareHousehold: false })
  })

  it('refuses an account that already has an entry, one with a one-word name, and one that does not exist', () => {
    const status = (fn: () => unknown) => { try { fn() } catch (e) { return (e as { statusCode?: number }).statusCode } }
    expect(status(() => db.transaction(tx => lib.createDirectoryEntry(tx, 'only-admin', 'make-entry')))).toBe(409)
    named('one-word', 'Cher')
    expect(status(() => db.transaction(tx => lib.createDirectoryEntry(tx, 'only-admin', 'one-word')))).toBe(400)
    expect(lib.loadAccount('one-word')!.person).toBeNull()
    expect(status(() => db.transaction(tx => lib.createDirectoryEntry(tx, 'only-admin', 'nobody')))).toBe(404)
  })
})

describe('what the accounts list shows of a person’s photo', () => {
  it('shows the photo only when the person shares it', () => {
    const now = new Date()
    db.insert(schema.user).values({ id: 'pic-user', name: 'Pic Person', email: 'pic@example.org', emailVerified: true, role: 'member', createdAt: now, updatedAt: now }).run()
    const personId = db.insert(schema.people).values({ firstName: 'Pic', lastName: 'Person', userId: 'pic-user', photoUrl: '/api/photos/x.jpg', sharePhoto: false }).returning().get().id
    expect(lib.loadAccount('pic-user')!.person!.photoUrl).toBeNull()
    db.update(schema.people).set({ sharePhoto: true }).where(orm.eq(schema.people.id, personId)).run()
    expect(lib.loadAccount('pic-user')!.person!.photoUrl).toBe('/api/photos/x.jpg')
  })
})
