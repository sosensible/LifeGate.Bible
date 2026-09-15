// Transactions and their splits: listing, categorizing, manual entry and payee rules.
//
// Bank descriptions and sensitive categories (e.g. Benevolence) can name the
// people the church helps. Only people who keep the budget see bank wording;
// anyone else sees a sensitive transaction under its category's name.
import { and, asc, desc, eq, exists, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import { monthEnd, type PayeeRuleView, type SplitView, type TransactionPage, type TransactionView } from '../../shared/stewardship.ts'
import { categories, financeAccounts, financeTransactions, payeeRules, transactionSplits } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'

type Reader = Tx | typeof db

export interface TransactionFilters {
  accountId?: string
  categoryId?: string // or "uncategorized"
  month?: string
  search?: string
  page: number
  pageSize: number
}

// SQLite LIKE has no escape character unless one is named.
const contains = (column: typeof financeTransactions.payee, text: string) =>
  sql`${column} like ${`%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`} escape '\\'`

export const loadTransactions = (
  filters: TransactionFilters,
  options: { canManage: boolean },
  reader: Reader = db,
): TransactionPage => {
  const conditions: SQL[] = []
  if (filters.accountId) conditions.push(eq(financeTransactions.accountId, filters.accountId))
  if (filters.month) {
    conditions.push(gte(financeTransactions.postedOn, `${filters.month}-01`), lte(financeTransactions.postedOn, monthEnd(filters.month)))
  }
  if (filters.categoryId) {
    const splitMatch = filters.categoryId === 'uncategorized'
      ? isNull(transactionSplits.categoryId)
      : eq(transactionSplits.categoryId, filters.categoryId)
    conditions.push(exists(
      reader.select({ one: sql`1` }).from(transactionSplits)
        .where(and(eq(transactionSplits.transactionId, financeTransactions.id), splitMatch)),
    ))
    if (filters.categoryId === 'uncategorized') conditions.push(eq(financeTransactions.isTransfer, false))
  }
  if (filters.search) {
    const fields = [
      contains(financeTransactions.payee, filters.search),
      contains(financeTransactions.memo, filters.search),
      ...(options.canManage ? [contains(financeTransactions.bankDescription, filters.search)] : []),
    ]
    conditions.push(or(...fields)!)
  }
  const where = conditions.length ? and(...conditions) : undefined

  const total = reader.select({ count: sql<number>`count(*)` }).from(financeTransactions).where(where).get()?.count ?? 0
  const rows = reader
    .select({ transaction: financeTransactions, accountName: financeAccounts.name })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(where)
    .orderBy(desc(financeTransactions.postedOn), desc(financeTransactions.createdAt))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize)
    .all()

  return {
    transactions: presentTransactions(rows, options, reader),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

export const loadTransaction = (id: string, options: { canManage: boolean }, reader: Reader = db) => {
  const row = reader
    .select({ transaction: financeTransactions, accountName: financeAccounts.name })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(eq(financeTransactions.id, id))
    .get()
  return row ? presentTransactions([row], options, reader)[0]! : null
}

const presentTransactions = (
  rows: Array<{ transaction: typeof financeTransactions.$inferSelect, accountName: string }>,
  options: { canManage: boolean },
  reader: Reader,
): TransactionView[] => {
  if (rows.length === 0) return []
  const splits = reader
    .select({ split: transactionSplits, categoryName: categories.name, isSensitive: categories.isSensitive })
    .from(transactionSplits)
    .leftJoin(categories, eq(categories.id, transactionSplits.categoryId))
    .where(inArray(transactionSplits.transactionId, rows.map(r => r.transaction.id)))
    .orderBy(asc(transactionSplits.sortOrder))
    .all()

  return rows.map(({ transaction, accountName }) => {
    const own = splits.filter(s => s.split.transactionId === transaction.id)
    const sensitive = own.find(s => s.isSensitive)
    const masked = !options.canManage && Boolean(sensitive)
    return {
      id: transaction.id,
      accountId: transaction.accountId,
      accountName,
      postedOn: transaction.postedOn,
      amountCents: transaction.amountCents,
      ...(options.canManage ? { bankDescription: transaction.bankDescription } : {}),
      payee: masked ? sensitive!.categoryName : transaction.payee,
      memo: masked ? null : transaction.memo,
      isTransfer: transaction.isTransfer,
      source: transaction.source,
      splits: own.map((s): SplitView => ({
        id: s.split.id,
        categoryId: s.split.categoryId,
        categoryName: s.categoryName,
        amountCents: s.split.amountCents,
        memo: masked ? null : s.split.memo,
      })),
    }
  })
}

const findTransaction = (tx: Reader, id: string) => {
  const transaction = tx.select().from(financeTransactions).where(eq(financeTransactions.id, id)).get()
  if (!transaction) throw createError({ statusCode: 404, statusMessage: 'Transaction not found' })
  return transaction
}

export const assertCategoriesExist = (tx: Reader, categoryIds: Array<string | null>) => {
  const ids = [...new Set(categoryIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return
  const found = tx.select({ id: categories.id }).from(categories).where(inArray(categories.id, ids)).all()
  if (found.length !== ids.length) throw createError({ statusCode: 400, statusMessage: 'One of the categories no longer exists' })
}

// Replace a transaction's splits. They must add up to the transaction.
export const replaceSplits = (
  tx: Tx,
  transactionId: string,
  splits: Array<{ categoryId: string | null, amountCents: number, memo: string | null }>,
) => {
  const transaction = findTransaction(tx, transactionId)
  const sum = splits.reduce((total, split) => total + split.amountCents, 0)
  if (sum !== transaction.amountCents) {
    throw createError({ statusCode: 400, statusMessage: 'The lines must add up to the transaction amount' })
  }
  assertCategoriesExist(tx, splits.map(s => s.categoryId))

  tx.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId)).run()
  tx.insert(transactionSplits).values(splits.map((split, index) => ({
    transactionId,
    categoryId: split.categoryId,
    amountCents: split.amountCents,
    memo: split.memo,
    sortOrder: index,
  }))).run()
}

export const updateTransaction = (
  tx: Tx,
  id: string,
  changes: { payee?: string | null, memo?: string | null, isTransfer?: boolean },
) => {
  const transaction = findTransaction(tx, id)
  const fields = (Object.keys(changes) as Array<keyof typeof changes>)
    .filter(field => changes[field] !== undefined && changes[field] !== transaction[field])
  if (fields.length === 0) return fields

  tx.update(financeTransactions).set(Object.fromEntries(fields.map(f => [f, changes[f]]))).where(eq(financeTransactions.id, id)).run()
  // A transfer is not spending or income: its lines lose their categories.
  if (changes.isTransfer) replaceSplits(tx, id, [{ categoryId: null, amountCents: transaction.amountCents, memo: null }])
  return fields
}

// Manual accounts only. Bank accounts get their transactions from SimpleFIN,
// so entering one by hand would count it twice.
export const createManualTransaction = (
  tx: Tx,
  input: { accountId: string, postedOn: string, amountCents: number, payee: string | null, memo: string | null, categoryId: string | null },
) => {
  const account = tx.select().from(financeAccounts).where(eq(financeAccounts.id, input.accountId)).get()
  if (!account) throw createError({ statusCode: 400, statusMessage: 'Account not found' })
  if (account.source !== 'manual') {
    throw createError({ statusCode: 400, statusMessage: 'This account’s transactions come from the bank' })
  }
  if (account.archivedAt) throw createError({ statusCode: 400, statusMessage: 'This account is archived' })
  assertCategoriesExist(tx, [input.categoryId])

  const { id } = tx.insert(financeTransactions).values({
    accountId: input.accountId,
    postedOn: input.postedOn,
    amountCents: input.amountCents,
    payee: input.payee,
    memo: input.memo,
    source: 'manual',
  }).returning({ id: financeTransactions.id }).get()
  tx.insert(transactionSplits).values({ transactionId: id, categoryId: input.categoryId, amountCents: input.amountCents }).run()
  return id
}

export const deleteManualTransaction = (tx: Tx, id: string) => {
  const transaction = findTransaction(tx, id)
  if (transaction.source !== 'manual') {
    throw createError({ statusCode: 400, statusMessage: 'Bank transactions cannot be removed' })
  }
  tx.delete(financeTransactions).where(eq(financeTransactions.id, id)).run()
}

export const loadPayeeRules = (reader: Reader = db): PayeeRuleView[] =>
  reader
    .select({ rule: payeeRules, categoryName: categories.name })
    .from(payeeRules)
    .leftJoin(categories, eq(categories.id, payeeRules.categoryId))
    .orderBy(asc(payeeRules.sortOrder), asc(payeeRules.createdAt))
    .all()
    .map(({ rule, categoryName }) => ({
      id: rule.id,
      matchText: rule.matchText,
      payee: rule.payee,
      categoryId: rule.categoryId,
      categoryName,
      sortOrder: rule.sortOrder,
    }))

// For transactions still on a single uncategorized line: the first rule whose
// text appears in the bank description sets the payee (if not already set)
// and the category. Returns how many transactions a rule changed.
export const applyPayeeRules = (tx: Tx, transactionIds: string[]) => {
  if (transactionIds.length === 0) return 0
  const rules = loadPayeeRules(tx)
  if (rules.length === 0) return 0

  const candidates = tx.select().from(financeTransactions)
    .where(and(inArray(financeTransactions.id, transactionIds), eq(financeTransactions.isTransfer, false)))
    .all()
  let changed = 0
  for (const transaction of candidates) {
    const lines = tx.select().from(transactionSplits).where(eq(transactionSplits.transactionId, transaction.id)).all()
    if (lines.length !== 1 || lines[0]!.categoryId !== null) continue

    const haystack = `${transaction.bankDescription ?? ''} ${transaction.payee ?? ''}`.toLowerCase()
    const rule = rules.find(r => haystack.includes(r.matchText.toLowerCase()))
    if (!rule) continue

    if (rule.payee && !transaction.payee) {
      tx.update(financeTransactions).set({ payee: rule.payee }).where(eq(financeTransactions.id, transaction.id)).run()
    }
    if (rule.categoryId) {
      tx.update(transactionSplits).set({ categoryId: rule.categoryId }).where(eq(transactionSplits.id, lines[0]!.id)).run()
    }
    changed++
  }
  return changed
}
