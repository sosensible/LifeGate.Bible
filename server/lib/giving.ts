// Offerings: giving records, counts and gifts, and linking a count to
// the deposit that carried it into the bank.
//
// Who gave what is known only to the Treasurer. Counters see the count they
// are entering and giver names to pick from, nothing more. A deposit's budget
// lines name categories, never givers, because the finance committee and
// ministries see transactions.
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { UNDESIGNATED_LABEL, type CountSummary, type CountTotals, type CountView, type DepositCandidate, type DesignationGroup, type GiftInput, type GiverDetail, type GiverInput, type GiverSearchResult, type GiverView } from '../../shared/giving.ts'
import { AVAILABLE_TO_FUND_ID, CASH_ACCOUNT_KINDS } from '../../shared/stewardship.ts'
import { categories, categoryGroups, financeAccounts, financeTransactions, gifts, givers, households, offeringCounts, people, transactionSplits } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'
import { addDays } from './schedule.ts'
import { createManualTransaction, replaceSplits } from './transactions.ts'

type Reader = Tx | typeof db

const notFound = (what: string) => createError({ statusCode: 404, statusMessage: `${what} not found` })

// ---- Designations -----------------------------------------------------------

// Categories a gift can be designated for: spending categories in use, in budget
// order. Names only, so counters can choose one without seeing any amounts.
export const designationGroups = (reader: Reader = db): DesignationGroup[] => {
  const rows = reader
    .select({ category: categories, group: categoryGroups })
    .from(categories)
    .innerJoin(categoryGroups, eq(categoryGroups.id, categories.groupId))
    .where(and(eq(categories.kind, 'spending'), isNull(categories.archivedAt), isNull(categoryGroups.archivedAt)))
    .orderBy(asc(categoryGroups.sortOrder), asc(categoryGroups.name), asc(categories.sortOrder), asc(categories.name))
    .all()
  const groups = new Map<string, DesignationGroup>()
  for (const { category, group } of rows) {
    const entry = groups.get(group.id) ?? { id: group.id, name: group.name, categories: [] }
    entry.categories.push({ id: category.id, name: category.name })
    groups.set(group.id, entry)
  }
  return [...groups.values()]
}

// ---- Givers -----------------------------------------------------------------

const escapeLike = (text: string) => `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`

// For counters: names only, active records.
export const searchGivers = (text: string, reader: Reader = db): GiverSearchResult[] =>
  reader
    .select({ id: givers.id, statementName: givers.statementName })
    .from(givers)
    .where(and(
      isNull(givers.archivedAt),
      text ? sql`${givers.statementName} like ${escapeLike(text)} escape '\\'` : undefined,
    ))
    .orderBy(asc(givers.statementName))
    .limit(20)
    .all()

const yearRange = (year: number) => [`${year}-01-01`, `${year}-12-31`] as const

// Totals from closed counts only: an open count may still change.
const closedGiftTotals = (reader: Reader, year: number, giverIds?: string[]) => {
  const [from, to] = yearRange(year)
  return new Map(reader
    .select({ giverId: gifts.giverId, cents: sql<number>`sum(${gifts.amountCents})` })
    .from(gifts)
    .innerJoin(offeringCounts, eq(offeringCounts.id, gifts.countId))
    .where(and(
      eq(offeringCounts.status, 'closed'),
      gte(gifts.receivedOn, from),
      lte(gifts.receivedOn, to),
      giverIds ? inArray(gifts.giverId, giverIds) : undefined,
    ))
    .groupBy(gifts.giverId)
    .all()
    .filter(row => row.giverId)
    .map(row => [row.giverId!, row.cents]))
}

export const loadGivers = (year: number, reader: Reader = db, ids?: string[]): GiverView[] => {
  const totals = closedGiftTotals(reader, year, ids)
  return reader
    .select({ giver: givers, householdName: households.name, first: people.firstName, last: people.lastName })
    .from(givers)
    .leftJoin(households, eq(households.id, givers.householdId))
    .leftJoin(people, eq(people.id, givers.personId))
    .where(ids ? inArray(givers.id, ids) : undefined)
    .orderBy(asc(givers.statementName))
    .all()
    .map(({ giver, householdName, first, last }) => ({
      id: giver.id,
      statementName: giver.statementName,
      householdId: giver.householdId,
      householdName,
      personId: giver.personId,
      personName: first ? `${first} ${last}` : null,
      mailingAddress: giver.mailingAddress,
      email: giver.email,
      delivery: giver.delivery,
      notes: giver.notes,
      archivedAt: giver.archivedAt?.toISOString() ?? null,
      yearTotalCents: totals.get(giver.id) ?? 0,
    }))
}

export const loadGiver = (id: string, year: number, reader: Reader = db): GiverDetail => {
  const giver = loadGivers(year, reader, [id])[0]
  if (!giver) throw notFound('Giving record')
  const history = reader
    .select({ gift: gifts, categoryName: categories.name, status: offeringCounts.status })
    .from(gifts)
    .leftJoin(categories, eq(categories.id, gifts.categoryId))
    .innerJoin(offeringCounts, eq(offeringCounts.id, gifts.countId))
    .where(eq(gifts.giverId, id))
    .orderBy(desc(gifts.receivedOn), desc(gifts.createdAt))
    .all()
  return {
    ...giver,
    gifts: history.map(({ gift, categoryName, status }) => ({
      id: gift.id,
      countId: gift.countId,
      receivedOn: gift.receivedOn,
      givenTo: categoryName ?? UNDESIGNATED_LABEL,
      memo: gift.memo,
      method: gift.method,
      checkNumber: gift.checkNumber,
      amountCents: gift.amountCents,
      countClosed: status === 'closed',
    })),
  }
}

export const findGiver = (reader: Reader, id: string) => {
  const giver = reader.select().from(givers).where(eq(givers.id, id)).get()
  if (!giver) throw notFound('Giving record')
  return giver
}

const assertLinks = (tx: Reader, input: Pick<GiverInput, 'householdId' | 'personId'>) => {
  if (input.householdId && input.personId) {
    throw createError({ statusCode: 400, statusMessage: 'Link a household or a person, not both' })
  }
  if (input.householdId && !tx.select({ id: households.id }).from(households).where(eq(households.id, input.householdId)).get()) {
    throw createError({ statusCode: 400, statusMessage: 'That household no longer exists' })
  }
  if (input.personId && !tx.select({ id: people.id }).from(people).where(eq(people.id, input.personId)).get()) {
    throw createError({ statusCode: 400, statusMessage: 'That person no longer exists' })
  }
}

export const createGiver = (tx: Tx, input: GiverInput) => {
  assertLinks(tx, input)
  return tx.insert(givers).values(input).returning({ id: givers.id }).get().id
}

export const createQuickGiver = (tx: Tx, statementName: string) =>
  tx.insert(givers).values({ statementName }).returning({ id: givers.id }).get().id

// Returns the fields that changed (names only, for the audit log).
export const updateGiver = (tx: Tx, id: string, input: GiverInput) => {
  const giver = findGiver(tx, id)
  assertLinks(tx, input)
  const fields = (Object.keys(input) as Array<keyof GiverInput>).filter(field => input[field] !== giver[field])
  if (fields.length) tx.update(givers).set(Object.fromEntries(fields.map(f => [f, input[f]]))).where(eq(givers.id, id)).run()
  return fields
}

export const setGiverArchived = (tx: Tx, id: string, archived: boolean) => {
  const giver = findGiver(tx, id)
  if (archived === Boolean(giver.archivedAt)) return false
  tx.update(givers).set({ archivedAt: archived ? new Date() : null }).where(eq(givers.id, id)).run()
  return true
}

// A giver with gifts is part of the giving history: archive it instead.
export const deleteGiver = (tx: Tx, id: string) => {
  findGiver(tx, id)
  const used = tx.select({ n: sql<number>`count(*)` }).from(gifts).where(eq(gifts.giverId, id)).get()?.n ?? 0
  if (used) throw createError({ statusCode: 409, statusMessage: 'This giving record has gifts, so it can only be archived' })
  tx.delete(givers).where(eq(givers.id, id)).run()
}

// ---- Counts -----------------------------------------------------------------

export const findCount = (reader: Reader, id: string) => {
  const count = reader.select().from(offeringCounts).where(eq(offeringCounts.id, id)).get()
  if (!count) throw notFound('Count')
  return count
}

export const assertCountOpen = (count: typeof offeringCounts.$inferSelect) => {
  if (count.status !== 'open') throw createError({ statusCode: 409, statusMessage: 'This count is closed' })
}

export const loadCounts = (options: { openOnly: boolean, withTotals: boolean, year?: number }, reader: Reader = db): CountSummary[] => {
  const totals = new Map(reader
    .select({ countId: gifts.countId, n: sql<number>`count(*)`, cents: sql<number>`sum(${gifts.amountCents})` })
    .from(gifts)
    .groupBy(gifts.countId)
    .all()
    .map(row => [row.countId, row]))
  return reader.select().from(offeringCounts)
    .where(and(
      options.openOnly ? eq(offeringCounts.status, 'open') : undefined,
      options.year ? gte(offeringCounts.countedOn, `${options.year}-01-01`) : undefined,
      options.year ? lte(offeringCounts.countedOn, `${options.year}-12-31`) : undefined,
    ))
    .orderBy(desc(offeringCounts.countedOn), desc(offeringCounts.createdAt))
    .all()
    .map(count => ({
      id: count.id,
      countedOn: count.countedOn,
      label: count.label,
      status: count.status,
      giftCount: totals.get(count.id)?.n ?? 0,
      ...(options.withTotals ? { totalCents: totals.get(count.id)?.cents ?? 0 } : {}),
      depositLinked: Boolean(count.depositTransactionId),
    }))
}

// Undesignated gifts (no category) are listed first; they go to Available to Fund.
export const countTotals = (countId: string, reader: Reader = db): CountTotals => {
  const rows = reader
    .select({ gift: gifts, categoryName: categories.name, categorySort: categories.sortOrder, groupSort: categoryGroups.sortOrder })
    .from(gifts)
    .leftJoin(categories, eq(categories.id, gifts.categoryId))
    .leftJoin(categoryGroups, eq(categoryGroups.id, categories.groupId))
    .where(eq(gifts.countId, countId))
    .all()
  const byCategory = new Map<string | null, CountTotals['byCategory'][number] & { sort: [number, number] }>()
  let cashCents = 0
  let checkCents = 0
  let otherCents = 0
  for (const { gift, categoryName, categorySort, groupSort } of rows) {
    if (gift.method === 'cash') cashCents += gift.amountCents
    else if (gift.method === 'check') checkCents += gift.amountCents
    else otherCents += gift.amountCents
    const line = byCategory.get(gift.categoryId) ?? {
      categoryId: gift.categoryId,
      givenTo: categoryName ?? UNDESIGNATED_LABEL,
      amountCents: 0,
      sort: gift.categoryId ? [groupSort ?? 0, categorySort ?? 0] : [-1, -1],
    }
    line.amountCents += gift.amountCents
    byCategory.set(gift.categoryId, line)
  }
  return {
    cashCents,
    checkCents,
    otherCents,
    totalCents: cashCents + checkCents + otherCents,
    byCategory: [...byCategory.values()]
      .sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1] || a.givenTo.localeCompare(b.givenTo))
      .map(({ sort: _sort, ...line }) => line),
  }
}

export const loadCount = (id: string, reader: Reader = db): CountView => {
  const count = findCount(reader, id)
  const rows = reader
    .select({ gift: gifts, categoryName: categories.name, giverName: givers.statementName })
    .from(gifts)
    .leftJoin(categories, eq(categories.id, gifts.categoryId))
    .leftJoin(givers, eq(givers.id, gifts.giverId))
    .where(eq(gifts.countId, id))
    .orderBy(asc(gifts.createdAt))
    .all()
  const totals = countTotals(id, reader)
  const deposit = count.depositTransactionId
    ? reader.select({ transactionId: financeTransactions.id, accountName: financeAccounts.name, postedOn: financeTransactions.postedOn })
        .from(financeTransactions)
        .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
        .where(eq(financeTransactions.id, count.depositTransactionId))
        .get() ?? null
    : null
  return {
    id: count.id,
    countedOn: count.countedOn,
    label: count.label,
    status: count.status,
    expectedCashCents: count.expectedCashCents,
    expectedCheckCents: count.expectedCheckCents,
    counterNames: count.counterNames,
    notes: count.notes,
    closedAt: count.closedAt?.toISOString() ?? null,
    balanced: totals.cashCents === count.expectedCashCents && totals.checkCents === count.expectedCheckCents && totals.totalCents > 0,
    deposit,
    gifts: rows.map(({ gift, categoryName, giverName }) => ({
      id: gift.id,
      giverId: gift.giverId,
      giverName,
      categoryId: gift.categoryId,
      givenTo: categoryName ?? UNDESIGNATED_LABEL,
      memo: gift.memo,
      method: gift.method,
      checkNumber: gift.checkNumber,
      receivedOn: gift.receivedOn,
      amountCents: gift.amountCents,
    })),
    totals,
  }
}

export const openCount = (tx: Tx, input: Omit<typeof offeringCounts.$inferInsert, 'id' | 'status'>) =>
  tx.insert(offeringCounts).values({ ...input, status: 'open' }).returning({ id: offeringCounts.id }).get().id

export const updateCount = (tx: Tx, id: string, changes: Partial<Pick<typeof offeringCounts.$inferInsert, 'countedOn' | 'label' | 'expectedCashCents' | 'expectedCheckCents' | 'counterNames' | 'notes'>>) => {
  const count = findCount(tx, id)
  assertCountOpen(count)
  const fields = (Object.keys(changes) as Array<keyof typeof changes>).filter(f => changes[f] !== undefined && changes[f] !== count[f])
  if (!fields.length) return fields
  tx.update(offeringCounts).set(Object.fromEntries(fields.map(f => [f, changes[f]]))).where(eq(offeringCounts.id, id)).run()
  // Gifts dated with the count move with it; ones given their own date stay.
  if (changes.countedOn && changes.countedOn !== count.countedOn) {
    tx.update(gifts).set({ receivedOn: changes.countedOn })
      .where(and(eq(gifts.countId, id), eq(gifts.receivedOn, count.countedOn))).run()
  }
  return fields
}

// `existing`: a category a gift already has may stay even if it was archived since.
const assertGiftRefs = (tx: Reader, giverId: string | null, categoryIds: Array<string | null>, existing: string | null = null) => {
  if (giverId) {
    const giver = tx.select({ id: givers.id }).from(givers).where(eq(givers.id, giverId)).get()
    if (!giver) throw createError({ statusCode: 400, statusMessage: 'That giving record no longer exists' })
  }
  const unique = [...new Set(categoryIds.filter((id): id is string => Boolean(id) && id !== existing))]
  if (!unique.length) return
  const found = tx.select({ id: categories.id }).from(categories)
    .where(and(inArray(categories.id, unique), eq(categories.kind, 'spending'), isNull(categories.archivedAt)))
    .all()
  if (found.length !== unique.length) throw createError({ statusCode: 400, statusMessage: 'Choose a budget category that is in use' })
}

const assertCheckNumber = (method: string, checkNumber: string | null) => {
  if (checkNumber && method !== 'check') throw createError({ statusCode: 400, statusMessage: 'Only checks have a check number' })
}

// A memo says what a designated gift is for; undesignated giving needs none.
const assertMemo = (categoryId: string | null, memo: string | null) => {
  if (memo && !categoryId) throw createError({ statusCode: 400, statusMessage: 'A memo is only for designated gifts' })
}

// A split gift is saved as one gift per line. Returns their ids.
export const addGift = (tx: Tx, countId: string, input: GiftInput) => {
  const count = findCount(tx, countId)
  assertCountOpen(count)
  assertGiftRefs(tx, input.giverId, input.lines.map(l => l.categoryId))
  assertCheckNumber(input.method, input.checkNumber)
  for (const line of input.lines) assertMemo(line.categoryId, line.memo || null)
  return input.lines.map(line => tx.insert(gifts).values({
    countId,
    giverId: input.giverId,
    categoryId: line.categoryId,
    amountCents: line.amountCents,
    memo: line.memo || null,
    method: input.method,
    checkNumber: input.checkNumber,
    receivedOn: input.receivedOn ?? count.countedOn,
  }).returning({ id: gifts.id }).get().id)
}

const findGiftInCount = (tx: Reader, countId: string, giftId: string) => {
  const gift = tx.select().from(gifts).where(and(eq(gifts.id, giftId), eq(gifts.countId, countId))).get()
  if (!gift) throw notFound('Gift')
  return gift
}

export const updateGift = (
  tx: Tx,
  countId: string,
  giftId: string,
  input: Pick<typeof gifts.$inferInsert, 'giverId' | 'categoryId' | 'method' | 'checkNumber' | 'receivedOn' | 'amountCents' | 'memo'>,
) => {
  assertCountOpen(findCount(tx, countId))
  const gift = findGiftInCount(tx, countId, giftId)
  assertGiftRefs(tx, input.giverId ?? null, [input.categoryId ?? null], gift.categoryId)
  assertCheckNumber(input.method, input.checkNumber ?? null)
  input = { ...input, memo: input.memo || null }
  assertMemo(input.categoryId ?? null, input.memo ?? null)
  const fields = (Object.keys(input) as Array<keyof typeof input>).filter(f => input[f] !== gift[f])
  if (fields.length) tx.update(gifts).set(Object.fromEntries(fields.map(f => [f, input[f]]))).where(eq(gifts.id, giftId)).run()
  return fields
}

export const removeGift = (tx: Tx, countId: string, giftId: string) => {
  assertCountOpen(findCount(tx, countId))
  findGiftInCount(tx, countId, giftId)
  tx.delete(gifts).where(eq(gifts.id, giftId)).run()
}

// Only when the gifts match the count sheet: cash to cash, checks to checks.
export const closeCount = (tx: Tx, id: string, userId: string) => {
  const count = findCount(tx, id)
  assertCountOpen(count)
  const totals = countTotals(id, tx)
  if (totals.totalCents === 0) throw createError({ statusCode: 400, statusMessage: 'This count has no gifts' })
  if (totals.cashCents !== count.expectedCashCents || totals.checkCents !== count.expectedCheckCents) {
    throw createError({ statusCode: 400, statusMessage: 'The gifts don’t match the count sheet yet' })
  }
  tx.update(offeringCounts).set({ status: 'closed', closedAt: new Date(), closedByUserId: userId }).where(eq(offeringCounts.id, id)).run()
}

// The reason is added to the count's notes with the date.
export const reopenCount = (tx: Tx, id: string, reason: string) => {
  const count = findCount(tx, id)
  if (count.status !== 'closed') throw createError({ statusCode: 409, statusMessage: 'This count is already open' })
  if (count.depositTransactionId) {
    throw createError({ statusCode: 409, statusMessage: 'Unlink the deposit before reopening this count' })
  }
  const line = `Reopened ${new Date().toISOString().slice(0, 10)}: ${reason}`
  tx.update(offeringCounts).set({
    status: 'open',
    closedAt: null,
    closedByUserId: null,
    notes: count.notes ? `${count.notes}\n${line}` : line,
  }).where(eq(offeringCounts.id, id)).run()
}

// ---- Deposits ---------------------------------------------------------------

const DEPOSIT_WINDOW_DAYS = 7

const assertClosedUnlinked = (count: typeof offeringCounts.$inferSelect) => {
  if (count.status !== 'closed') throw createError({ statusCode: 409, statusMessage: 'Close the count before linking its deposit' })
  if (count.depositTransactionId) throw createError({ statusCode: 409, statusMessage: 'This count already has a deposit' })
}

// Deposits in cash accounts near the count date for exactly the count's total,
// not yet categorized (or only to Available to Fund by a payee rule), and not
// already linked to another count.
export const depositCandidates = (countId: string, reader: Reader = db): DepositCandidate[] => {
  const count = findCount(reader, countId)
  const { totalCents } = countTotals(countId, reader)
  if (totalCents === 0) return []
  const rows = reader
    .select({ transaction: financeTransactions, accountName: financeAccounts.name, kind: financeAccounts.kind })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(and(
      eq(financeTransactions.amountCents, totalCents),
      eq(financeTransactions.isTransfer, false),
      gte(financeTransactions.postedOn, addDays(count.countedOn, -DEPOSIT_WINDOW_DAYS)),
      lte(financeTransactions.postedOn, addDays(count.countedOn, DEPOSIT_WINDOW_DAYS)),
      sql`not exists (select 1 from ${offeringCounts} where ${offeringCounts.depositTransactionId} = ${financeTransactions.id})`,
    ))
    .all()
    .filter(row => CASH_ACCOUNT_KINDS.includes(row.kind))
  const uncategorized = (transactionId: string) => {
    const lines = reader.select().from(transactionSplits).where(eq(transactionSplits.transactionId, transactionId)).all()
    return lines.length === 1 && (lines[0]!.categoryId === null || lines[0]!.categoryId === AVAILABLE_TO_FUND_ID)
  }
  const distance = (date: string) => Math.abs(new Date(date).getTime() - new Date(count.countedOn).getTime())
  return rows
    .filter(row => uncategorized(row.transaction.id))
    .sort((a, b) => distance(a.transaction.postedOn) - distance(b.transaction.postedOn))
    .map(({ transaction, accountName }) => ({
      id: transaction.id,
      accountName,
      postedOn: transaction.postedOn,
      amountCents: transaction.amountCents,
      description: transaction.bankDescription ?? transaction.payee,
    }))
}

// Splits the deposit: undesignated giving to Available to Fund, designated gifts to their categories.
const splitDeposit = (tx: Tx, countId: string, count: typeof offeringCounts.$inferSelect, transactionId: string) => {
  const totals = countTotals(countId, tx)
  replaceSplits(tx, transactionId, totals.byCategory.map(line => ({
    categoryId: line.categoryId ?? AVAILABLE_TO_FUND_ID,
    amountCents: line.amountCents,
    memo: line.categoryId ? `Designated offering ${count.countedOn}` : `Offering ${count.countedOn}`,
  })))
  tx.update(financeTransactions).set({ payee: sql`coalesce(${financeTransactions.payee}, 'Offering')` })
    .where(eq(financeTransactions.id, transactionId)).run()
  tx.update(offeringCounts).set({ depositTransactionId: transactionId }).where(eq(offeringCounts.id, countId)).run()
}

export const linkDeposit = (tx: Tx, countId: string, transactionId: string) => {
  const count = findCount(tx, countId)
  assertClosedUnlinked(count)
  if (!depositCandidates(countId, tx).some(candidate => candidate.id === transactionId)) {
    throw createError({ statusCode: 400, statusMessage: 'That transaction doesn’t match this count’s total, date or account' })
  }
  splitDeposit(tx, countId, count, transactionId)
  return transactionId
}

// For a manual cash account, such as a cash box: enter the deposit, then split it.
export const recordDeposit = (tx: Tx, countId: string, accountId: string, postedOn: string) => {
  const count = findCount(tx, countId)
  assertClosedUnlinked(count)
  const account = tx.select().from(financeAccounts).where(eq(financeAccounts.id, accountId)).get()
  if (!account || !CASH_ACCOUNT_KINDS.includes(account.kind)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a checking, savings or cash account' })
  }
  const { totalCents } = countTotals(countId, tx)
  const transactionId = createManualTransaction(tx, { accountId, postedOn, amountCents: totalCents, payee: 'Offering', memo: null, categoryId: null })
  splitDeposit(tx, countId, count, transactionId)
  return transactionId
}

// The deposit goes back to one uncategorized line.
export const unlinkDeposit = (tx: Tx, countId: string) => {
  const count = findCount(tx, countId)
  if (!count.depositTransactionId) throw createError({ statusCode: 409, statusMessage: 'This count has no deposit' })
  const transaction = tx.select().from(financeTransactions).where(eq(financeTransactions.id, count.depositTransactionId)).get()
  if (transaction) replaceSplits(tx, transaction.id, [{ categoryId: null, amountCents: transaction.amountCents, memo: null }])
  tx.update(offeringCounts).set({ depositTransactionId: null }).where(eq(offeringCounts.id, countId)).run()
  return count.depositTransactionId
}

// Manual cash accounts a deposit can be recorded in.
export const manualCashAccounts = (reader: Reader = db) =>
  reader.select({ id: financeAccounts.id, name: financeAccounts.name, kind: financeAccounts.kind })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.source, 'manual'), isNull(financeAccounts.archivedAt)))
    .orderBy(asc(financeAccounts.sortOrder), asc(financeAccounts.name))
    .all()
    .filter(account => CASH_ACCOUNT_KINDS.includes(account.kind))
    .map(({ id, name }) => ({ id, name }))
