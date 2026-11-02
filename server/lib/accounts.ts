// Sign-in accounts for the accounts admin, and the rules that keep the church
// from locking itself out.
import { eq, isNull, max } from 'drizzle-orm'
import { createError } from 'h3'
import { splitAccountName, type AccountView } from '../../shared/accounts.ts'
import { parseRoles, type AssignableRole } from '../../shared/auth/role-info.ts'
import { auditLog, people, user } from '../database/schema/index.ts'
import { recordAudit, type Tx } from './audit.ts'
import { db } from './db.ts'

export const loadAccounts = (id?: string): AccountView[] => {
  const lastSignIns = new Map(
    db.select({ userId: auditLog.actorUserId, at: max(auditLog.createdAt) })
      .from(auditLog)
      .where(eq(auditLog.action, 'auth.signIn'))
      .groupBy(auditLog.actorUserId)
      .all()
      .map(row => [row.userId, row.at]),
  )

  return db
    .select({ account: user, personId: people.id, firstName: people.firstName, lastName: people.lastName, photoUrl: people.photoUrl, sharePhoto: people.sharePhoto })
    .from(user)
    .leftJoin(people, eq(people.userId, user.id))
    .where(id ? eq(user.id, id) : undefined)
    .orderBy(user.name)
    .all()
    .map(({ account, personId, firstName, lastName, photoUrl, sharePhoto }) => {
      const lastSignIn = lastSignIns.get(account.id) as Date | number | null | undefined
      return {
        id: account.id,
        name: account.name,
        email: account.email,
        roles: parseRoles(account.role),
        blocked: Boolean(account.banned),
        blockReason: account.banReason ?? null,
        // A photo is shown here only if the person shares it, as to any other member.
        person: personId && firstName && lastName ? { id: personId, firstName, lastName, photoUrl: sharePhoto ? photoUrl : null } : null,
        createdAt: account.createdAt.toISOString(),
        lastSignInAt: lastSignIn ? new Date(lastSignIn instanceof Date ? lastSignIn : Number(lastSignIn) * 1000).toISOString() : null,
      }
    })
}

export const loadAccount = (id: string) => loadAccounts(id)[0]

// Active (not blocked) administrators other than the one given.
const otherActiveAdmins = (exceptUserId: string) =>
  db.select({ id: user.id, role: user.role, banned: user.banned }).from(user)
    .all()
    .filter(account => !account.banned && account.id !== exceptUserId && parseRoles(account.role).includes('admin'))
    .length

type Change =
  | { kind: 'roles', roles: AssignableRole[] }
  | { kind: 'block' }
  | { kind: 'delete' }

// Refuses a change that would lock the actor out or leave no administrator.
export const assertSafeAccountChange = (actorUserId: string, target: Pick<AccountView, 'id' | 'roles' | 'blocked'>, change: Change) => {
  const isSelf = actorUserId === target.id
  const targetIsActiveAdmin = target.roles.includes('admin') && !target.blocked
  const removesAdmin = change.kind !== 'roles' || !change.roles.includes('admin')

  if (isSelf && change.kind === 'block') {
    throw createError({ statusCode: 400, statusMessage: 'You cannot block your own account' })
  }
  if (isSelf && change.kind === 'delete') {
    throw createError({ statusCode: 400, statusMessage: 'You cannot delete your own account' })
  }
  if (isSelf && targetIsActiveAdmin && removesAdmin) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot remove your own administrator role. Ask another administrator.' })
  }
  if (targetIsActiveAdmin && removesAdmin && otherActiveAdmins(target.id) === 0) {
    throw createError({ statusCode: 400, statusMessage: 'This is the only active administrator. Make someone else an administrator first.' })
  }
}

// Better Auth stores roles comma-separated; an account with none gets `user`.
export const storedRoles = (roles: AssignableRole[]) => (roles.length ? [...new Set(roles)] : ['user'])

// Connecting accounts and directory entries. One account per person and one
// person per account; the People page and the Accounts page both use these.
// Without a userId, checks only the person (for an account not created yet).
export const assertCanLink = (personId: string, userId?: string) => {
  const person = db.select({ userId: people.userId }).from(people).where(eq(people.id, personId)).get()
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  if (person.userId) throw createError({ statusCode: 409, statusMessage: 'That person already has sign-in access' })
  if (userId && db.select({ id: people.id }).from(people).where(eq(people.userId, userId)).get()) {
    throw createError({ statusCode: 409, statusMessage: 'That account is already connected to another directory entry' })
  }
}

// Call inside a transaction, after assertCanLink.
export const linkAccount = (tx: Tx, actorUserId: string, personId: string, userId: string) => {
  tx.update(people).set({ userId }).where(eq(people.id, personId)).run()
  recordAudit(tx, { actorUserId, action: 'account.link', entityType: 'person', entityId: personId })
}

// Makes a directory entry for an account that has none, from its name and email, and
// connects them. The office then fills in the rest on the People page. Nothing is
// guessed: an account whose name is one word has to be named first.
export const createDirectoryEntry = (tx: Tx, actorUserId: string, userId: string) => {
  const account = tx.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).get()
  if (!account) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
  if (tx.select({ id: people.id }).from(people).where(eq(people.userId, userId)).get()) {
    throw createError({ statusCode: 409, statusMessage: 'That account is already connected to a directory entry' })
  }
  const name = splitAccountName(account.name)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'This account’s name is one word. Give it a first and last name first, or add the person on the People page.' })
  const personId = tx.insert(people).values({ ...name, kind: 'member', isMinor: false, email: account.email, userId }).returning({ id: people.id }).get().id
  recordAudit(tx, { actorUserId, action: 'person.create', entityType: 'person', entityId: personId, note: 'From an account' })
  recordAudit(tx, { actorUserId, action: 'account.link', entityType: 'person', entityId: personId })
  return personId
}

export const unlinkAccount = (tx: Tx, actorUserId: string, personId: string) => {
  tx.update(people).set({ userId: null }).where(eq(people.id, personId)).run()
  recordAudit(tx, { actorUserId, action: 'account.unlink', entityType: 'person', entityId: personId })
}

// Directory entries with no sign-in access, for choosing whom an account belongs to.
export const loadUnlinkedPeople = () =>
  db.select({ id: people.id, firstName: people.firstName, lastName: people.lastName, email: people.email, kind: people.kind, isMinor: people.isMinor })
    .from(people)
    .where(isNull(people.userId))
    .orderBy(people.lastName, people.firstName)
    .all()

