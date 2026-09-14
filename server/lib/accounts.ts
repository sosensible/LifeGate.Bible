// Sign-in accounts for the accounts admin, and the rules that keep the church
// from locking itself out.
import { eq, max } from 'drizzle-orm'
import { createError } from 'h3'
import type { AccountView } from '../../shared/accounts.ts'
import { parseRoles, type AssignableRole } from '../../shared/auth/role-info.ts'
import { auditLog, people, user } from '../database/schema/index.ts'
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
    .select({ account: user, personId: people.id, firstName: people.firstName, lastName: people.lastName })
    .from(user)
    .leftJoin(people, eq(people.userId, user.id))
    .where(id ? eq(user.id, id) : undefined)
    .orderBy(user.name)
    .all()
    .map(({ account, personId, firstName, lastName }) => {
      const lastSignIn = lastSignIns.get(account.id) as Date | number | null | undefined
      return {
        id: account.id,
        name: account.name,
        email: account.email,
        roles: parseRoles(account.role),
        blocked: Boolean(account.banned),
        blockReason: account.banReason ?? null,
        person: personId && firstName && lastName ? { id: personId, firstName, lastName } : null,
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
