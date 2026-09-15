// Stewardship accounts and categories: loading, presenting and the rules for changing them.
import { and, asc, count, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { CASH_ACCOUNT_KINDS, type AccountView, type CategoryGroupView, type CategoryView } from '../../shared/stewardship.ts'
import { categories, categoryGroups, categoryMonths, financeAccounts, financeTransactions, payeeRules, transactionSplits } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'

type Reader = Tx | typeof db

export const loadAccounts = (reader: Reader = db): AccountView[] => {
  const sums = new Map(reader
    .select({ accountId: financeTransactions.accountId, cents: sql<number>`sum(${financeTransactions.amountCents})` })
    .from(financeTransactions)
    .groupBy(financeTransactions.accountId)
    .all()
    .map(row => [row.accountId, row.cents]))

  return reader.select().from(financeAccounts).orderBy(asc(financeAccounts.sortOrder), asc(financeAccounts.name)).all()
    .map(account => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      source: account.source,
      institution: account.institution,
      isCash: CASH_ACCOUNT_KINDS.includes(account.kind),
      balanceCents: account.source === 'simplefin' && account.balanceCents !== null
        ? account.balanceCents
        : account.openingBalanceCents + (sums.get(account.id) ?? 0),
      balanceDate: account.balanceDate?.toISOString() ?? null,
      openingBalanceCents: account.openingBalanceCents,
      sortOrder: account.sortOrder,
      archivedAt: account.archivedAt?.toISOString() ?? null,
    }))
}

export const findAccount = (reader: Reader, id: string) => {
  const account = reader.select().from(financeAccounts).where(eq(financeAccounts.id, id)).get()
  if (!account) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
  return account
}

const presentCategory = (category: typeof categories.$inferSelect): CategoryView => ({
  id: category.id,
  groupId: category.groupId,
  name: category.name,
  kind: category.kind,
  rollover: category.rollover,
  isSensitive: category.isSensitive,
  sortOrder: category.sortOrder,
  archivedAt: category.archivedAt?.toISOString() ?? null,
})

export const loadCategoryGroups = (reader: Reader = db): CategoryGroupView[] => {
  const cats = reader.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)).all()
  return reader.select().from(categoryGroups).orderBy(asc(categoryGroups.sortOrder), asc(categoryGroups.name)).all()
    .map(group => ({
      id: group.id,
      name: group.name,
      sortOrder: group.sortOrder,
      archivedAt: group.archivedAt?.toISOString() ?? null,
      categories: cats.filter(c => c.groupId === group.id).map(presentCategory),
    }))
}

export const findCategory = (reader: Reader, id: string) => {
  const category = reader.select().from(categories).where(eq(categories.id, id)).get()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'Category not found' })
  return category
}

export const findGroup = (reader: Reader, id: string) => {
  const group = reader.select().from(categoryGroups).where(eq(categoryGroups.id, id)).get()
  if (!group) throw createError({ statusCode: 404, statusMessage: 'Category group not found' })
  return group
}

export const assertNotSystemCategory = (category: typeof categories.$inferSelect) => {
  if (category.kind !== 'spending') {
    throw createError({ statusCode: 400, statusMessage: 'Available to Fund cannot be changed' })
  }
}

// Which of the requested fields actually differ from the stored row.
export const changedFields = <T extends Record<string, unknown>>(current: T, changes: Partial<T>) =>
  (Object.keys(changes) as Array<keyof T & string>).filter(field => changes[field] !== undefined && changes[field] !== current[field])

// A category that has never held money or been used can be removed outright;
// otherwise it is archived so history still adds up.
export const categoryIsUsed = (reader: Reader, id: string) => {
  const splits = reader.select({ n: count() }).from(transactionSplits).where(eq(transactionSplits.categoryId, id)).get()?.n ?? 0
  const months = reader.select({ n: count() }).from(categoryMonths).where(eq(categoryMonths.categoryId, id)).get()?.n ?? 0
  return splits + months > 0
}

export const deleteCategory = (tx: Tx, id: string) => {
  const category = findCategory(tx, id)
  assertNotSystemCategory(category)
  if (categoryIsUsed(tx, id)) {
    throw createError({ statusCode: 400, statusMessage: 'This category has transactions or funding. Archive it instead.' })
  }
  tx.delete(payeeRules).where(eq(payeeRules.categoryId, id)).run()
  tx.delete(categories).where(eq(categories.id, id)).run()
  return category
}

export const deleteGroup = (tx: Tx, id: string) => {
  findGroup(tx, id)
  const inGroup = tx.select({ n: count() }).from(categories).where(eq(categories.groupId, id)).get()?.n ?? 0
  if (inGroup > 0) throw createError({ statusCode: 400, statusMessage: 'Move or remove this group’s categories first' })
  tx.delete(categoryGroups).where(eq(categoryGroups.id, id)).run()
}

export const nextSortOrder = (reader: Reader, table: typeof categories | typeof categoryGroups, groupId?: string) => {
  const where = table === categories && groupId ? eq(categories.groupId, groupId) : undefined
  const row = reader.select({ max: sql<number | null>`max(${table.sortOrder})` }).from(table).where(where ? and(where) : undefined).get()
  return (row?.max ?? -1) + 1
}
