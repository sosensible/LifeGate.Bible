// What ministries may see of the budget.
//
// Pastors, deacons and the church secretary grant a ministry access to a
// category: `totals` (Funded, Activity, Remaining) or `ledger` (those plus the
// transactions), for the ministry's leaders or everyone serving in it. They
// work from names only and never see amounts. Sensitive categories can be
// granted at `totals` at most.
import { and, asc, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { createError } from 'h3'
import {
  CASH_ACCOUNT_KINDS,
  monthEnd,
  type MinistryAccessAudience,
  type MinistryAccessLevel,
  type MinistryAccessMatrix,
  type MinistryBudgetSummary,
  type MinistryBudgetView,
} from '../../shared/stewardship.ts'
import { categories, categoryGroups, financeAccounts, financeTransactions, ministries, ministryCategoryAccess, ministryMembers, people, transactionSplits } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { monthView } from './budget.ts'
import { db } from './db.ts'

type Reader = Tx | typeof db

const rank = { totals: 1, ledger: 2 } as const

// Categories a signed-in person can see through the ministries they serve in,
// per ministry: Map<ministryId, Map<categoryId, level>>.
export const grantsForUser = (userId: string, reader: Reader = db) => {
  const rows = reader
    .select({
      ministryId: ministryCategoryAccess.ministryId,
      categoryId: ministryCategoryAccess.categoryId,
      level: ministryCategoryAccess.level,
      audience: ministryCategoryAccess.audience,
      isLeader: ministryMembers.isLeader,
      isSensitive: categories.isSensitive,
    })
    .from(people)
    .innerJoin(ministryMembers, eq(ministryMembers.personId, people.id))
    .innerJoin(ministryCategoryAccess, eq(ministryCategoryAccess.ministryId, ministryMembers.ministryId))
    .innerJoin(categories, eq(categories.id, ministryCategoryAccess.categoryId))
    .where(and(eq(people.userId, userId), isNull(categories.archivedAt)))
    .all()

  const byMinistry = new Map<string, Map<string, MinistryAccessLevel>>()
  for (const row of rows) {
    if (row.audience === 'leaders' && !row.isLeader) continue
    // Belt and braces: the grant route already refuses this.
    const level: MinistryAccessLevel = row.isSensitive ? 'totals' : row.level
    const grants = byMinistry.get(row.ministryId) ?? new Map<string, MinistryAccessLevel>()
    const current = grants.get(row.categoryId)
    if (!current || rank[level] > rank[current]) grants.set(row.categoryId, level)
    byMinistry.set(row.ministryId, grants)
  }
  return byMinistry
}

// Every grant a ministry has, regardless of audience: what the Treasurer and
// Finance Committee see when they look at a ministry's page.
const grantsForMinistry = (ministryId: string, reader: Reader) =>
  new Map(reader
    .select({ categoryId: ministryCategoryAccess.categoryId, level: ministryCategoryAccess.level, isSensitive: categories.isSensitive })
    .from(ministryCategoryAccess)
    .innerJoin(categories, eq(categories.id, ministryCategoryAccess.categoryId))
    .where(and(eq(ministryCategoryAccess.ministryId, ministryId), isNull(categories.archivedAt)))
    .all()
    .map(row => [row.categoryId, (row.isSensitive ? 'totals' : row.level) as MinistryAccessLevel]))

export const ministryBudgetsFor = (userId: string, options: { seesAll: boolean }, reader: Reader = db): MinistryBudgetSummary[] => {
  const all = reader.select().from(ministries).orderBy(asc(ministries.sortOrder)).all()
  if (options.seesAll) {
    const counts = new Map<string, number>()
    for (const row of reader.select({ ministryId: ministryCategoryAccess.ministryId }).from(ministryCategoryAccess).all()) {
      counts.set(row.ministryId, (counts.get(row.ministryId) ?? 0) + 1)
    }
    return all.filter(m => counts.has(m.id)).map(m => ({ slug: m.slug, name: m.name, categoryCount: counts.get(m.id)! }))
  }
  const grants = grantsForUser(userId, reader)
  return all.filter(m => grants.get(m.id)?.size).map(m => ({ slug: m.slug, name: m.name, categoryCount: grants.get(m.id)!.size }))
}

export const ministryBudgetView = (
  slug: string,
  month: string,
  viewer: { userId: string, seesAll: boolean },
  reader: Reader = db,
): MinistryBudgetView => {
  const ministry = reader.select().from(ministries).where(eq(ministries.slug, slug)).get()
  if (!ministry) throw createError({ statusCode: 404, statusMessage: 'Ministry not found' })

  const grants = viewer.seesAll ? grantsForMinistry(ministry.id, reader) : grantsForUser(viewer.userId, reader).get(ministry.id)
  if (!grants?.size) throw createError({ statusCode: 403, statusMessage: 'Not allowed' })

  const rows = monthView(month, reader).groups.flatMap(g => g.categories).filter(c => grants.has(c.id))
  const ledgerIds = rows.filter(r => grants.get(r.id) === 'ledger').map(r => r.id)

  const ledger = ledgerIds.length === 0
    ? []
    : reader
        .select({
          id: transactionSplits.id,
          categoryId: transactionSplits.categoryId,
          postedOn: financeTransactions.postedOn,
          payee: financeTransactions.payee,
          memo: transactionSplits.memo,
          transactionMemo: financeTransactions.memo,
          amountCents: transactionSplits.amountCents,
        })
        .from(transactionSplits)
        .innerJoin(financeTransactions, eq(financeTransactions.id, transactionSplits.transactionId))
        .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
        // The same transactions the month's Activity is made of.
        .where(and(
          inArray(transactionSplits.categoryId, ledgerIds),
          inArray(financeAccounts.kind, [...CASH_ACCOUNT_KINDS]),
          eq(financeTransactions.isTransfer, false),
          gte(financeTransactions.postedOn, `${month}-01`),
          lte(financeTransactions.postedOn, monthEnd(month)),
        ))
        .orderBy(desc(financeTransactions.postedOn))
        .all()

  return {
    ministry: { slug: ministry.slug, name: ministry.name },
    month,
    categories: rows.map(row => ({
      ...row,
      level: grants.get(row.id)!,
      ...(grants.get(row.id) === 'ledger'
        ? {
            ledger: ledger.filter(l => l.categoryId === row.id).map(l => ({
              id: l.id,
              postedOn: l.postedOn,
              payee: l.payee,
              memo: l.memo ?? l.transactionMemo,
              amountCents: l.amountCents,
            })),
          }
        : {}),
    })),
  }
}

// Names only: ministries, groups and categories, and the current grants.
export const accessMatrix = (reader: Reader = db): MinistryAccessMatrix => {
  const groups = reader.select().from(categoryGroups).where(isNull(categoryGroups.archivedAt)).orderBy(asc(categoryGroups.sortOrder), asc(categoryGroups.name)).all()
  const cats = reader.select().from(categories)
    .where(and(isNull(categories.archivedAt), eq(categories.kind, 'spending')))
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .all()
  return {
    ministries: reader.select({ id: ministries.id, slug: ministries.slug, name: ministries.name }).from(ministries).orderBy(asc(ministries.sortOrder)).all(),
    groups: groups
      .map(g => ({ id: g.id, name: g.name, categories: cats.filter(c => c.groupId === g.id).map(c => ({ id: c.id, name: c.name, isSensitive: c.isSensitive })) }))
      .filter(g => g.categories.length > 0),
    grants: reader.select({
      ministryId: ministryCategoryAccess.ministryId,
      categoryId: ministryCategoryAccess.categoryId,
      level: ministryCategoryAccess.level,
      audience: ministryCategoryAccess.audience,
    }).from(ministryCategoryAccess).all(),
  }
}

// Grant, change or remove one ministry's access to one category. Returns the
// audit action, or null when nothing changed.
export const setGrant = (
  tx: Tx,
  input: { ministryId: string, categoryId: string, level: 'none' | MinistryAccessLevel, audience: MinistryAccessAudience },
  grantedByUserId: string,
) => {
  const ministry = tx.select().from(ministries).where(eq(ministries.id, input.ministryId)).get()
  if (!ministry) throw createError({ statusCode: 400, statusMessage: 'Ministry not found' })
  const category = tx.select().from(categories).where(eq(categories.id, input.categoryId)).get()
  if (!category || category.kind !== 'spending') throw createError({ statusCode: 400, statusMessage: 'Category not found' })
  if (category.isSensitive && input.level === 'ledger') {
    throw createError({ statusCode: 400, statusMessage: `${category.name} is sensitive, so ministries can see its totals only` })
  }

  const where = and(eq(ministryCategoryAccess.ministryId, input.ministryId), eq(ministryCategoryAccess.categoryId, input.categoryId))
  const existing = tx.select().from(ministryCategoryAccess).where(where).get()

  if (input.level === 'none') {
    if (!existing) return null
    tx.delete(ministryCategoryAccess).where(where).run()
    return 'ministryAccess.revoke'
  }
  if (existing && existing.level === input.level && existing.audience === input.audience) return null

  tx.insert(ministryCategoryAccess)
    .values({ ministryId: input.ministryId, categoryId: input.categoryId, level: input.level, audience: input.audience, grantedByUserId })
    .onConflictDoUpdate({
      target: [ministryCategoryAccess.ministryId, ministryCategoryAccess.categoryId],
      set: { level: input.level, audience: input.audience, grantedByUserId, updatedAt: new Date() },
    })
    .run()
  return existing ? 'ministryAccess.change' : 'ministryAccess.grant'
}
