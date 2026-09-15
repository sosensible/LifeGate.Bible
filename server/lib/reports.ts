// Semi-annual reports: January–June and July–December, by category group.
//
// Category figures come from the budget itself (monthView), so a report always
// agrees with the Budget page. The summary follows cash: what was in the cash
// accounts at the start, what came in and went out, and what was there at the
// end. It reconciles:
//
//   start + offerings + other in + out + uncategorized + transfers = end
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import {
  AVAILABLE_TO_FUND_ID,
  CASH_ACCOUNT_KINDS,
  addMonths,
  currentMonth,
  monthEnd,
  reportMonths,
  reportPeriodLabel,
  type ReportPeriod,
  type ReportRow,
  type ReportSummary,
  type ReportTotals,
  type ReportTransaction,
  type SemiAnnualReport,
} from '../../shared/stewardship.ts'
import { categories, categoryGroups, financeAccounts, financeTransactions, offeringCounts, transactionSplits } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { cashAtMonthEnd, monthView } from './budget.ts'
import { db } from './db.ts'

type Reader = Tx | typeof db

const emptyTotals = (): ReportTotals => ({
  carriedInCents: 0,
  fundedCents: 0,
  activityCents: 0,
  returnedCents: 0,
  remainingCents: 0,
  monthlyActivityCents: [0, 0, 0, 0, 0, 0],
})

const addInto = (totals: ReportTotals, row: ReportTotals) => {
  totals.carriedInCents += row.carriedInCents
  totals.fundedCents += row.fundedCents
  totals.activityCents += row.activityCents
  totals.returnedCents += row.returnedCents
  totals.remainingCents += row.remainingCents
  row.monthlyActivityCents.forEach((cents, i) => { totals.monthlyActivityCents[i]! += cents })
  return totals
}

const cashAccountIds = (reader: Reader) =>
  reader.select({ id: financeAccounts.id }).from(financeAccounts)
    .where(inArray(financeAccounts.kind, [...CASH_ACCOUNT_KINDS]))
    .all()
    .map(row => row.id)

const periodRange = (months: string[]) => [`${months[0]}-01`, monthEnd(months.at(-1)!)] as const

const summarize = (months: string[], reader: Reader) => {
  const [from, to] = periodRange(months)
  const cashIds = cashAccountIds(reader)
  const summary = { undesignatedOfferingsCents: 0, designatedOfferingsCents: 0, otherInCents: 0, outCents: 0, transfersCents: 0, uncategorizedCents: 0 }
  let uncategorizedCount = 0
  if (!cashIds.length) return { ...summary, uncategorizedCount }

  const inPeriod = and(
    inArray(financeTransactions.accountId, cashIds),
    gte(financeTransactions.postedOn, from),
    lte(financeTransactions.postedOn, to),
  )
  const lines = reader
    .select({
      transactionId: financeTransactions.id,
      isTransfer: financeTransactions.isTransfer,
      categoryId: transactionSplits.categoryId,
      amountCents: transactionSplits.amountCents,
      isDeposit: sql<number>`exists (select 1 from ${offeringCounts} where ${offeringCounts.depositTransactionId} = ${financeTransactions.id})`,
    })
    .from(transactionSplits)
    .innerJoin(financeTransactions, eq(financeTransactions.id, transactionSplits.transactionId))
    .where(inPeriod)
    .all()

  const uncategorized = new Set<string>()
  for (const line of lines) {
    if (line.isTransfer) summary.transfersCents += line.amountCents
    else if (line.categoryId === null) {
      summary.uncategorizedCents += line.amountCents
      uncategorized.add(line.transactionId)
    }
    else if (line.amountCents < 0) summary.outCents += line.amountCents
    else if (line.isDeposit && line.categoryId === AVAILABLE_TO_FUND_ID) summary.undesignatedOfferingsCents += line.amountCents
    else if (line.isDeposit) summary.designatedOfferingsCents += line.amountCents
    else summary.otherInCents += line.amountCents
  }
  uncategorizedCount = uncategorized.size
  return { ...summary, uncategorizedCount }
}

export const semiAnnualReport = (period: ReportPeriod, reader: Reader = db, today = currentMonth()): SemiAnnualReport => {
  const months = reportMonths(period)
  const before = monthView(addMonths(months[0]!, -1), reader)
  const views = months.map(month => monthView(month, reader))
  const last = views.at(-1)!

  // Every category that shows in any month, in the last month's group order.
  const rowsById = new Map<string, ReportRow>()
  const groupOf = new Map<string, { id: string, name: string }>()
  const order: string[] = []
  const groupOrder: string[] = []
  for (const view of [...views].reverse()) {
    for (const group of view.groups) {
      if (!groupOrder.includes(group.id)) groupOrder.push(group.id)
      for (const category of group.categories) {
        if (!groupOf.has(category.id)) {
          groupOf.set(category.id, { id: group.id, name: group.name })
          order.push(category.id)
        }
      }
    }
  }
  const beforeRows = new Map(before.groups.flatMap(g => g.categories).map(c => [c.id, c]))
  const detailOf = new Map(reader.select({ id: categoryGroups.id, reportDetail: categoryGroups.reportDetail }).from(categoryGroups).all().map(g => [g.id, g.reportDetail]))

  for (const id of order) {
    const monthly = views.map(view => view.groups.flatMap(g => g.categories).find(c => c.id === id))
    const known = monthly.find(Boolean) ?? beforeRows.get(id)!
    const carriedInCents = known.rollover ? beforeRows.get(id)?.remainingCents ?? 0 : 0
    const fundedCents = monthly.reduce((sum, c) => sum + (c?.fundedCents ?? 0), 0)
    const monthlyActivityCents = monthly.map(c => c?.activityCents ?? 0)
    const activityCents = monthlyActivityCents.reduce((sum, cents) => sum + cents, 0)
    const remainingCents = monthly.at(-1)?.remainingCents ?? 0
    const row: ReportRow = {
      id,
      name: known.name,
      isSensitive: known.isSensitive,
      rollover: known.rollover,
      carriedInCents,
      fundedCents,
      activityCents,
      returnedCents: carriedInCents + fundedCents + activityCents - remainingCents,
      remainingCents,
      monthlyActivityCents,
    }
    const empty = !row.carriedInCents && !row.fundedCents && !row.remainingCents && row.monthlyActivityCents.every(c => !c)
    if (!empty) rowsById.set(id, row)
  }

  // Group names and order from the last month; categories within in budget order.
  const lastOrder = new Map(last.groups.flatMap(g => g.categories).map((c, i) => [c.id, i]))
  const groups = groupOrder
    .map((groupId) => {
      const rows = order
        .filter(id => groupOf.get(id)?.id === groupId && rowsById.has(id))
        .sort((a, b) => (lastOrder.get(a) ?? 0) - (lastOrder.get(b) ?? 0))
        .map(id => rowsById.get(id)!)
      const name = [...groupOf.values()].find(g => g.id === groupId)?.name ?? ''
      return { id: groupId, name, reportDetail: detailOf.get(groupId) ?? 'categories' as const, categories: rows, totals: rows.reduce(addInto, emptyTotals()) }
    })
    .filter(group => group.categories.length > 0)
  const groupIndex = new Map(last.groups.map((g, i) => [g.id, i]))
  groups.sort((a, b) => (groupIndex.get(a.id) ?? -1) - (groupIndex.get(b.id) ?? -1))

  // A group reported as a total lists no categories (e.g. staff pay).
  const showReturned = groups.some(g => g.categories.some(c => c.returnedCents !== 0))
  const reported = groups.map(group => group.reportDetail === 'total' ? { ...group, categories: [] } : group)

  const { uncategorizedCount, ...flows } = summarize(months, reader)
  const summary: ReportSummary = {
    cashStartCents: cashAtMonthEnd(addMonths(months[0]!, -1), reader),
    cashEndCents: cashAtMonthEnd(months.at(-1)!, reader),
    availableToFundStartCents: before.availableToFundCents,
    availableToFundEndCents: last.availableToFundCents,
    ...flows,
  }

  const totals = groups.reduce((sum, group) => addInto(sum, group.totals), emptyTotals())
  return {
    period,
    label: reportPeriodLabel(period),
    months,
    toDate: months.at(-1)! >= today,
    summary,
    groups: reported,
    totals,
    showReturned,
    uncategorizedCount,
  }
}

// Every line in the cash accounts in the period, for the detailed CSV. A
// sensitive category (e.g. Benevolence) shows its own name instead of the
// payee, and no memo. A group reported as a total shows only the group's name,
// with no category, payee or memo. Bank descriptions are never included.
export const reportTransactions = (period: ReportPeriod, reader: Reader = db): ReportTransaction[] => {
  const months = reportMonths(period)
  const [from, to] = periodRange(months)
  const cashIds = cashAccountIds(reader)
  if (!cashIds.length) return []
  return reader
    .select({
      postedOn: financeTransactions.postedOn,
      account: financeAccounts.name,
      payee: financeTransactions.payee,
      transactionMemo: financeTransactions.memo,
      isTransfer: financeTransactions.isTransfer,
      splitMemo: transactionSplits.memo,
      amountCents: transactionSplits.amountCents,
      category: categories.name,
      kind: categories.kind,
      isSensitive: categories.isSensitive,
      group: categoryGroups.name,
      reportDetail: categoryGroups.reportDetail,
    })
    .from(transactionSplits)
    .innerJoin(financeTransactions, eq(financeTransactions.id, transactionSplits.transactionId))
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .leftJoin(categories, eq(categories.id, transactionSplits.categoryId))
    .leftJoin(categoryGroups, eq(categoryGroups.id, categories.groupId))
    .where(and(inArray(financeTransactions.accountId, cashIds), gte(financeTransactions.postedOn, from), lte(financeTransactions.postedOn, to)))
    .orderBy(asc(financeTransactions.postedOn), asc(financeTransactions.createdAt), asc(transactionSplits.sortOrder))
    .all()
    .map((line) => {
      const totalOnly = line.kind === 'spending' && line.reportDetail === 'total'
      const masked = totalOnly || line.isSensitive
      return {
        postedOn: line.postedOn,
        account: line.account,
        group: line.kind === 'availableToFund' ? null : line.group,
        category: totalOnly ? line.group : line.category,
        payee: masked ? (totalOnly ? line.group : line.category) : line.payee,
        memo: masked ? null : (line.splitMemo ?? line.transactionMemo),
        amountCents: line.amountCents,
        isTransfer: line.isTransfer,
      }
    })
}

