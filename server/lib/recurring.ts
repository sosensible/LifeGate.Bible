// Recurring transactions: upcoming occurrences, matching bank imports, and
// entering them automatically in manual accounts.
//
// Each can be any mix of: a reminder (just listed as upcoming), feeding its
// category's plan, matching bank transactions, and being entered automatically
// in a manual account. Handled occurrences are stored so none is matched or
// entered twice.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import type { RecurringInput, RecurringView, UpcomingOccurrence } from '../../shared/stewardship.ts'
import { categories, financeAccounts, financeTransactions, recurringOccurrences, recurringTransactions, transactionSplits } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'
import { epochToDate } from './simplefin-protocol.ts'
import { addDays, nextOccurrence, occurrencesBetween } from './schedule.ts'
import { createManualTransaction } from './transactions.ts'

type Reader = Tx | typeof db

// A bank transaction this many days either side of the due date can match.
export const MATCH_WINDOW_DAYS = 5
// "Amount varies": within this share of the usual amount.
export const VARIES_TOLERANCE = 0.25

export const today = () => epochToDate(Date.now() / 1000)

export const loadRecurring = (reader: Reader = db, options: { on?: string } = {}): RecurringView[] => {
  const on = options.on ?? today()
  return reader
    .select({ item: recurringTransactions, accountName: financeAccounts.name, categoryName: categories.name, isSensitive: categories.isSensitive })
    .from(recurringTransactions)
    .leftJoin(financeAccounts, eq(financeAccounts.id, recurringTransactions.accountId))
    .leftJoin(categories, eq(categories.id, recurringTransactions.categoryId))
    .orderBy(asc(recurringTransactions.name))
    .all()
    .map(({ item, accountName, categoryName, isSensitive }) => ({
      id: item.id,
      name: item.name,
      payee: item.payee,
      memo: item.memo,
      amountCents: item.amountCents,
      amountVaries: item.amountVaries,
      frequency: item.frequency,
      anchorOn: item.anchorOn,
      endOn: item.endOn,
      accountId: item.accountId,
      categoryId: item.categoryId,
      feedsPlan: item.feedsPlan,
      matchBank: item.matchBank,
      matchText: item.matchText,
      autoEnter: item.autoEnter,
      accountName,
      categoryName,
      isSensitive: Boolean(isSensitive),
      nextDueOn: item.archivedAt ? null : nextOccurrence(item, on),
      archivedAt: item.archivedAt?.toISOString() ?? null,
    }))
}

// For people who can read but not keep the budget: a recurring payment in a
// sensitive category (e.g. Benevolence) shows under its category's name, like
// its transactions do.
export const maskRecurring = <T extends { isSensitive: boolean, categoryName: string | null, name: string, payee: string | null }>(item: T, canManage: boolean): T =>
  canManage || !item.isSensitive
    ? item
    : { ...item, name: item.categoryName ?? 'Sensitive', payee: null, ...('memo' in item ? { memo: null } : {}), ...('matchText' in item ? { matchText: null } : {}) }

// The server enforces what the form suggests.
export const assertRecurringValid = (tx: Reader, input: RecurringInput) => {
  if (input.accountId) {
    const account = tx.select().from(financeAccounts).where(eq(financeAccounts.id, input.accountId)).get()
    if (!account) throw createError({ statusCode: 400, statusMessage: 'Account not found' })
    if (input.autoEnter && account.source !== 'manual') {
      throw createError({ statusCode: 400, statusMessage: 'Only manual accounts can have transactions entered automatically; bank accounts get them from the bank' })
    }
  }
  if (input.categoryId) {
    const category = tx.select().from(categories).where(eq(categories.id, input.categoryId)).get()
    if (!category) throw createError({ statusCode: 400, statusMessage: 'Category not found' })
  }
}

const handledFor = (reader: Reader, recurringIds: string[]) => {
  const map = new Map<string, typeof recurringOccurrences.$inferSelect>()
  if (recurringIds.length === 0) return map
  for (const row of reader.select().from(recurringOccurrences).where(inArray(recurringOccurrences.recurringId, recurringIds)).all()) {
    map.set(`${row.recurringId}|${row.dueOn}`, row)
  }
  return map
}

// Every occurrence in a date range, open or handled.
export const upcoming = (from: string, to: string, options: { categoryId?: string, on?: string } = {}, reader: Reader = db): UpcomingOccurrence[] => {
  const on = options.on ?? today()
  const items = loadRecurring(reader, { on })
    .filter(item => !item.archivedAt && (!options.categoryId || item.categoryId === options.categoryId))
  const handled = handledFor(reader, items.map(i => i.id))

  return items
    .flatMap(item => occurrencesBetween(item, from, to).map((dueOn): UpcomingOccurrence => {
      const done = handled.get(`${item.id}|${dueOn}`)
      return {
        recurringId: item.id,
        name: item.name,
        payee: item.payee,
        amountCents: item.amountCents,
        dueOn,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        isSensitive: item.isSensitive,
        accountName: item.accountName,
        status: done ? done.status : dueOn < on ? 'overdue' : 'open',
        transactionId: done?.transactionId ?? null,
      }
    }))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name))
}

export const skipOccurrence = (tx: Tx, recurringId: string, dueOn: string) => {
  const item = tx.select().from(recurringTransactions).where(eq(recurringTransactions.id, recurringId)).get()
  if (!item) throw createError({ statusCode: 404, statusMessage: 'Recurring transaction not found' })
  if (!occurrencesBetween(item, dueOn, dueOn).length) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing is due on that date' })
  }
  tx.insert(recurringOccurrences)
    .values({ recurringId, dueOn, status: 'skipped' })
    .onConflictDoNothing()
    .run()
}

const amountMatches = (expected: number, actual: number, varies: boolean) => {
  if (Math.sign(expected) !== Math.sign(actual)) return false
  if (!varies) return expected === actual
  return Math.abs(actual - expected) <= Math.abs(expected) * VARIES_TOLERANCE
}

// For newly imported bank transactions still on one uncategorized line: find
// an open occurrence of a matching recurring transaction and apply it.
// Returns the ids of transactions that matched.
export const matchImported = (tx: Tx, transactionIds: string[]) => {
  if (transactionIds.length === 0) return []
  const items = tx.select().from(recurringTransactions)
    .where(and(eq(recurringTransactions.matchBank, true), isNull(recurringTransactions.archivedAt)))
    .all()
  if (items.length === 0) return []

  const handled = handledFor(tx, items.map(i => i.id))
  const matched: string[] = []
  const candidates = tx.select().from(financeTransactions)
    .where(and(inArray(financeTransactions.id, transactionIds), eq(financeTransactions.isTransfer, false)))
    .all()

  for (const transaction of candidates) {
    const lines = tx.select().from(transactionSplits).where(eq(transactionSplits.transactionId, transaction.id)).all()
    if (lines.length !== 1 || lines[0]!.categoryId !== null) continue
    const text = `${transaction.bankDescription ?? ''} ${transaction.payee ?? ''}`.toLowerCase()

    let best: { item: typeof items[number], dueOn: string, distance: number } | null = null
    for (const item of items) {
      if (item.accountId && item.accountId !== transaction.accountId) continue
      if (item.matchText && !text.includes(item.matchText.toLowerCase())) continue
      if (!amountMatches(item.amountCents, transaction.amountCents, item.amountVaries)) continue
      const window = occurrencesBetween(item, addDays(transaction.postedOn, -MATCH_WINDOW_DAYS), addDays(transaction.postedOn, MATCH_WINDOW_DAYS))
      for (const dueOn of window) {
        if (handled.has(`${item.id}|${dueOn}`)) continue
        const distance = Math.abs(new Date(dueOn).getTime() - new Date(transaction.postedOn).getTime())
        if (!best || distance < best.distance) best = { item, dueOn, distance }
      }
    }
    if (!best) continue

    if (best.item.categoryId) {
      tx.update(transactionSplits).set({ categoryId: best.item.categoryId }).where(eq(transactionSplits.id, lines[0]!.id)).run()
    }
    if (!transaction.payee && (best.item.payee || best.item.name)) {
      tx.update(financeTransactions).set({ payee: best.item.payee || best.item.name }).where(eq(financeTransactions.id, transaction.id)).run()
    }
    tx.insert(recurringOccurrences).values({ recurringId: best.item.id, dueOn: best.dueOn, status: 'paid', transactionId: transaction.id }).run()
    handled.set(`${best.item.id}|${best.dueOn}`, { recurringId: best.item.id, dueOn: best.dueOn, status: 'paid', transactionId: transaction.id, handledAt: new Date() })
    matched.push(transaction.id)
  }
  return matched
}

// Enter every due occurrence of "enter automatically" items in their manual
// accounts. Only occurrences on or after the day the item was set up count,
// so adding a bill with a past first date does not back-fill a year of entries.
export const autoEnterDue = (on: string = today()) => db.transaction((tx) => {
  const items = tx.select({ item: recurringTransactions, account: financeAccounts })
    .from(recurringTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, recurringTransactions.accountId))
    .where(and(eq(recurringTransactions.autoEnter, true), isNull(recurringTransactions.archivedAt)))
    .all()
    .filter(({ account }) => account.source === 'manual' && !account.archivedAt)

  const handled = handledFor(tx, items.map(({ item }) => item.id))
  const entered: string[] = []
  for (const { item } of items) {
    const setUpOn = epochToDate(item.createdAt.getTime() / 1000)
    const from = item.anchorOn > setUpOn ? item.anchorOn : setUpOn
    for (const dueOn of occurrencesBetween(item, from, on)) {
      if (handled.has(`${item.id}|${dueOn}`)) continue
      const transactionId = createManualTransaction(tx, {
        accountId: item.accountId!,
        postedOn: dueOn,
        amountCents: item.amountCents,
        payee: item.payee || item.name,
        memo: item.memo,
        categoryId: item.categoryId,
      })
      tx.insert(recurringOccurrences).values({ recurringId: item.id, dueOn, status: 'entered', transactionId }).run()
      entered.push(transactionId)
    }
  }
  return entered
})

// Plan bills for categories whose plans are built from recurring transactions.
export const planBillsByCategory = (reader: Reader = db) => {
  const map = new Map<string, Array<{ frequency: typeof recurringTransactions.$inferSelect['frequency'], anchorOn: string, endOn: string | null, amountCents: number }>>()
  const items = reader.select().from(recurringTransactions)
    .where(and(eq(recurringTransactions.feedsPlan, true), isNull(recurringTransactions.archivedAt)))
    .all()
  for (const item of items) {
    // Only money going out needs funding.
    if (!item.categoryId || item.amountCents >= 0) continue
    const bills = map.get(item.categoryId) ?? []
    bills.push({ frequency: item.frequency, anchorOn: item.anchorOn, endOn: item.endOn, amountCents: -item.amountCents })
    map.set(item.categoryId, bills)
  }
  return map
}
