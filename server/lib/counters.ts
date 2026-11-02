// Who may be named as having counted an offering: people whose role lets them enter
// gifts. The roles are read from the permission table, not listed a second time, so a
// role given that right later is included without a change here.
import { eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import { roles, type RoleName } from '../../shared/auth/permissions.ts'
import { parseRoles } from '../../shared/auth/role-info.ts'
import type { CounterOption } from '../../shared/giving.ts'
import { people, user } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'

type Reader = Tx | typeof db

const ROLES_THAT_COUNT = (Object.keys(roles) as RoleName[])
  .filter(role => (roles[role].statements as Record<string, readonly string[]>).giving?.includes('record'))

// "Jane Public": the directory name when the account has one, else the account's name.
const displayName = (account: { name: string }, person: { firstName: string | null, lastName: string | null } | null) =>
  person?.firstName && person.lastName ? `${person.firstName} ${person.lastName}` : account.name

// Active accounts that may enter gifts, by name.
export const listCounters = (reader: Reader = db): CounterOption[] =>
  reader.select({ account: user, firstName: people.firstName, lastName: people.lastName })
    .from(user).leftJoin(people, eq(people.userId, user.id)).all()
    .filter(({ account }) => !account.banned && parseRoles(account.role).some(role => ROLES_THAT_COUNT.includes(role)))
    .map(({ account, firstName, lastName }) => ({ userId: account.id, name: displayName(account, { firstName, lastName }) }))
    .sort((a, b) => a.name.localeCompare(b.name))

// Names for accounts already on a count, whether or not they may still count.
export const countersNamed = (ids: string[], reader: Reader = db): CounterOption[] => {
  if (!ids.length) return []
  const rows = reader.select({ account: user, firstName: people.firstName, lastName: people.lastName })
    .from(user).leftJoin(people, eq(people.userId, user.id)).where(inArray(user.id, ids)).all()
  const names = new Map(rows.map(({ account, firstName, lastName }) => [account.id, displayName(account, { firstName, lastName })]))
  // In the order they were chosen; an account since deleted has no name to show.
  return ids.filter(id => names.has(id)).map(userId => ({ userId, name: names.get(userId)! }))
}

// The people to record on a count: every one must be allowed to count, except that
// someone already on the count may stay if they have since lost the right (it is a
// record of who counted). Returns the ids to store and the names to show.
export const chooseCounters = (reader: Reader, wanted: string[], alreadyOnCount: string[] = []) => {
  const ids = [...new Set(wanted)]
  const allowed = new Set([...listCounters(reader).map(c => c.userId), ...alreadyOnCount])
  if (ids.some(id => !allowed.has(id))) {
    throw createError({ statusCode: 400, statusMessage: 'Only people who are allowed to count can be named as having counted' })
  }
  const named = countersNamed(ids, reader)
  return { counterUserIds: named.map(c => c.userId), counterNames: named.map(c => c.name).join(', ') || null }
}
