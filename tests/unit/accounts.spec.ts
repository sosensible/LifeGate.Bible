// Account safeguards against a real, throwaway SQLite database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { needsDirectoryEntry } from '../../shared/accounts'
import { parseRoles, permissionLabels } from '../../shared/auth/role-info'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-accounts-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let lib: typeof import('../../server/lib/accounts')
let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')

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
