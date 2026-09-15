// The budget: what each category was funded, spent and has left, month by month.
//
// Only cash accounts (checking, savings, cash) take part. Their combined
// balance is the church's cash, and cash is either in a category or Available
// to Fund:
//
//   Available to Fund = cash − (sum of every category's Remaining) − uncategorized
//
// Remaining for a category in a month:
//   rollover: last month's Remaining + Funded + Activity
//   reset:    Funded + Activity (last month's leftover went back to Available to Fund)
//
// Uncategorized transactions are added back so they do not move Available to
// Fund until someone gives them a category. Transfers between the church's own
// accounts are not activity.
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { CASH_ACCOUNT_KINDS, addMonths, monthEnd, type BudgetCategoryRow, type BudgetMonthView } from '../../shared/stewardship.ts'
import { categories, categoryGroups, categoryMonths, financeAccounts, financeTransactions, transactionSplits } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'
import { planNeed } from './plan-math.ts'
import { loadPlans } from './plans.ts'
import { planBillsByCategory } from './recurring.ts'

type Reader = Tx | typeof db

const cashAccountIds = (reader: Reader) =>
  reader.select({ id: financeAccounts.id }).from(financeAccounts)
    .where(inArray(financeAccounts.kind, [...CASH_ACCOUNT_KINDS]))
    .all()
    .map(row => row.id)

// Cash on hand at the end of a month, across all cash accounts.
//   Bank (SimpleFIN) accounts: the reported balance, less anything posted after the month.
//   Manual accounts: the opening balance plus everything posted through the month.
export const cashAtMonthEnd = (month: string, reader: Reader = db) => {
  const end = monthEnd(month)
  const accounts = reader.select().from(financeAccounts)
    .where(inArray(financeAccounts.kind, [...CASH_ACCOUNT_KINDS]))
    .all()
  if (accounts.length === 0) return 0

  const sums = reader
    .select({
      accountId: financeTransactions.accountId,
      through: sql<number>`coalesce(sum(case when ${financeTransactions.postedOn} <= ${end} then ${financeTransactions.amountCents} else 0 end), 0)`,
      after: sql<number>`coalesce(sum(case when ${financeTransactions.postedOn} > ${end} then ${financeTransactions.amountCents} else 0 end), 0)`,
    })
    .from(financeTransactions)
    .where(inArray(financeTransactions.accountId, accounts.map(a => a.id)))
    .groupBy(financeTransactions.accountId)
    .all()
  const byAccount = new Map(sums.map(row => [row.accountId, row]))

  return accounts.reduce((total, account) => {
    const { through = 0, after = 0 } = byAccount.get(account.id) ?? {}
    if (account.source === 'simplefin' && account.balanceCents !== null) {
      return total + account.balanceCents - after
    }
    return total + account.openingBalanceCents + through
  }, 0)
}

const key = (categoryId: string, month: string) => `${categoryId}|${month}`

// The whole budget as of one month. Small data (one church), so it folds every
// month from the first with any funding or activity.
export const monthView = (month: string, reader: Reader = db): BudgetMonthView => {
  const end = monthEnd(month)
  const cashIds = cashAccountIds(reader)

  const groups = reader.select().from(categoryGroups).orderBy(asc(categoryGroups.sortOrder), asc(categoryGroups.name)).all()
  const allCategories = reader.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)).all()
  const spending = allCategories.filter(c => c.kind === 'spending')

  const funded = new Map<string, number>()
  const months = new Set<string>()
  for (const row of reader.select().from(categoryMonths).where(lte(categoryMonths.month, month)).all()) {
    funded.set(key(row.categoryId, row.month), row.fundedCents)
    months.add(row.month)
  }

  const activity = new Map<string, number>()
  let uncategorizedCents = 0
  let uncategorizedCount = 0
  if (cashIds.length > 0) {
    const rows = reader
      .select({
        categoryId: transactionSplits.categoryId,
        month: sql<string>`substr(${financeTransactions.postedOn}, 1, 7)`,
        cents: sql<number>`sum(${transactionSplits.amountCents})`,
        transactions: sql<number>`count(distinct ${financeTransactions.id})`,
      })
      .from(transactionSplits)
      .innerJoin(financeTransactions, eq(financeTransactions.id, transactionSplits.transactionId))
      .where(and(
        inArray(financeTransactions.accountId, cashIds),
        eq(financeTransactions.isTransfer, false),
        lte(financeTransactions.postedOn, end),
      ))
      .groupBy(transactionSplits.categoryId, sql`substr(${financeTransactions.postedOn}, 1, 7)`)
      .all()
    for (const row of rows) {
      if (row.categoryId === null) {
        uncategorizedCents += row.cents
        uncategorizedCount += row.transactions
        continue
      }
      activity.set(key(row.categoryId, row.month), row.cents)
      months.add(row.month)
    }
  }

  // Fold forward from the first month with anything in it, noting what each
  // category carried into the month being viewed (plans need it).
  const remaining = new Map<string, number>(spending.map(c => [c.id, 0]))
  const carriedIn = new Map<string, number>()
  const first = [...months].sort()[0]
  if (first) {
    for (let m = first; m <= month; m = addMonths(m, 1)) {
      for (const category of spending) {
        const carried = category.rollover ? remaining.get(category.id)! : 0
        if (m === month) carriedIn.set(category.id, carried)
        const change = (funded.get(key(category.id, m)) ?? 0) + (activity.get(key(category.id, m)) ?? 0)
        remaining.set(category.id, carried + change)
      }
    }
  }

  const plans = new Map(loadPlans(reader).map(plan => [plan.categoryId, plan]))
  const bills = plans.size ? planBillsByCategory(reader) : new Map()

  const rowFor = (category: typeof spending[number]): BudgetCategoryRow => {
    const row: BudgetCategoryRow = {
      id: category.id,
      name: category.name,
      rollover: category.rollover,
      isSensitive: category.isSensitive,
      fundedCents: funded.get(key(category.id, month)) ?? 0,
      activityCents: activity.get(key(category.id, month)) ?? 0,
      remainingCents: remaining.get(category.id) ?? 0,
    }
    const plan = plans.get(category.id)
    if (plan) {
      row.plan = planNeed(plan, {
        month,
        startRemainingCents: carriedIn.get(category.id) ?? 0,
        remainingCents: row.remainingCents,
        funded: m => funded.get(key(category.id, m)) ?? 0,
      }, bills.get(category.id) ?? [])
    }
    return row
  }

  const cashCents = cashAtMonthEnd(month, reader)
  const totalRemaining = [...remaining.values()].reduce((sum, value) => sum + value, 0)
  const needed = (rows: BudgetCategoryRow[]) => rows.reduce((sum, r) => sum + (r.plan?.neededCents ?? 0), 0)

  const viewGroups = groups
    .map((group) => {
      // Archived categories stay visible while they still hold or move money.
      const rows = spending
        .filter(c => c.groupId === group.id)
        .map(c => ({ category: c, row: rowFor(c) }))
        .filter(({ category, row }) => !category.archivedAt || row.remainingCents !== 0 || row.activityCents !== 0 || row.fundedCents !== 0)
        .map(({ row }) => row)
      return {
        id: group.id,
        name: group.name,
        archived: Boolean(group.archivedAt),
        fundedCents: rows.reduce((sum, r) => sum + r.fundedCents, 0),
        activityCents: rows.reduce((sum, r) => sum + r.activityCents, 0),
        remainingCents: rows.reduce((sum, r) => sum + r.remainingCents, 0),
        neededCents: needed(rows),
        categories: rows,
      }
    })
    .filter(group => !group.archived || group.categories.length > 0)
    .map(({ archived: _archived, ...group }) => group)

  return {
    month,
    cashCents,
    availableToFundCents: cashCents - totalRemaining - uncategorizedCents,
    uncategorizedCents,
    uncategorizedCount,
    neededCents: viewGroups.reduce((sum, g) => sum + g.neededCents, 0),
    groups: viewGroups,
  }
}

// Set how much a category is funded in a month. Zero removes the entry.
export const setFunding = (tx: Tx, categoryId: string, month: string, fundedCents: number) => {
  const category = tx.select().from(categories).where(eq(categories.id, categoryId)).get()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'Category not found' })
  if (category.kind !== 'spending') {
    throw createError({ statusCode: 400, statusMessage: 'Available to Fund is not funded directly' })
  }

  if (fundedCents === 0) {
    tx.delete(categoryMonths).where(and(eq(categoryMonths.categoryId, categoryId), eq(categoryMonths.month, month))).run()
    return category
  }
  tx.insert(categoryMonths)
    .values({ categoryId, month, fundedCents })
    .onConflictDoUpdate({ target: [categoryMonths.categoryId, categoryMonths.month], set: { fundedCents, updatedAt: new Date() } })
    .run()
  return category
}

// Uncategorized transactions in cash accounts, for the badge on the transactions page.
export const countUncategorized = (reader: Reader = db) =>
  reader
    .select({ count: sql<number>`count(distinct ${financeTransactions.id})` })
    .from(transactionSplits)
    .innerJoin(financeTransactions, eq(financeTransactions.id, transactionSplits.transactionId))
    .where(and(isNull(transactionSplits.categoryId), eq(financeTransactions.isTransfer, false)))
    .get()?.count ?? 0
