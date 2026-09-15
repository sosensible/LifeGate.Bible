// SimpleFIN Bridge sync: storing the church's bank balances and transactions.
//
// Read-only. Connect with `npm run simplefin:claim -- <setup token>` and put the
// access URL in SIMPLEFIN_ACCESS_URL. SimpleFIN asks for no more than about 24
// requests a day and serves at most 90 days per request.
import { and, desc, eq, gte } from 'drizzle-orm'
import { createError } from 'h3'
import { decimalToCents } from '../../shared/money.ts'
import type { AccountKind, SyncRunView } from '../../shared/stewardship.ts'
import { financeAccounts, financeTransactions, syncRuns, transactionSplits } from '../database/schema/index.ts'
import { recordAudit, type Tx } from './audit.ts'
import { db } from './db.ts'
import { epochToDate, fetchAccountSet, MIN_MANUAL_INTERVAL_MS, syncWindowStart, type SimplefinAccountSet } from './simplefin-protocol.ts'
import { matchImported } from './recurring.ts'
import { applyPayeeRules } from './transactions.ts'

const guessKind = (name: string): AccountKind => {
  const lower = name.toLowerCase()
  if (/saving|money market/.test(lower)) return 'savings'
  if (/credit|card|visa|mastercard/.test(lower)) return 'credit'
  return 'checking'
}

export const setMessages = (set: SimplefinAccountSet) => [
  ...(set.errlist ?? []).map(e => e.msg || e.code || 'Unknown SimpleFIN error'),
  ...(set.errors ?? []),
]

// Store what SimpleFIN returned. Existing transactions are left alone (the
// treasurer may have categorized them); new ones arrive uncategorized.
export const importAccountSet = (tx: Tx, set: SimplefinAccountSet) => {
  const connections = new Map((set.connections ?? []).map(c => [c.conn_id, c.name]))
  const messages: string[] = []
  const addedIds: string[] = []

  for (const account of set.accounts ?? []) {
    if (account.currency !== 'USD') {
      messages.push(`Skipped ${account.name}: only US dollar accounts are supported`)
      continue
    }
    const institution = (account.conn_id && connections.get(account.conn_id)) || account.org?.name || null
    const balanceCents = decimalToCents(account.balance)
    const balanceDate = account['balance-date'] ? new Date(account['balance-date'] * 1000) : null

    const existing = tx.select().from(financeAccounts).where(eq(financeAccounts.externalId, account.id)).get()
    const accountId = existing
      ? (tx.update(financeAccounts)
          .set({ balanceCents, balanceDate, institution: existing.institution ?? institution })
          .where(eq(financeAccounts.id, existing.id))
          .run(), existing.id)
      : tx.insert(financeAccounts).values({
          name: account.name,
          kind: guessKind(account.name),
          source: 'simplefin',
          externalId: account.id,
          institution,
          balanceCents,
          balanceDate,
        }).returning({ id: financeAccounts.id }).get().id

    for (const item of account.transactions ?? []) {
      if (item.pending || !item.posted) continue
      const amountCents = decimalToCents(item.amount)
      if (amountCents === null) {
        messages.push(`Skipped a transaction in ${account.name} with an unreadable amount`)
        continue
      }
      const inserted = tx.insert(financeTransactions).values({
        accountId,
        externalId: item.id,
        postedOn: epochToDate(item.posted),
        amountCents,
        bankDescription: item.description || null,
        payee: item.payee?.trim() || null,
        memo: item.memo?.trim() || null,
        source: 'simplefin',
      }).onConflictDoNothing().returning({ id: financeTransactions.id }).get()
      if (!inserted) continue
      tx.insert(transactionSplits).values({ transactionId: inserted.id, categoryId: null, amountCents }).run()
      addedIds.push(inserted.id)
    }
  }

  // Recurring bills first (they know the category for this occurrence), then payee rules.
  const matched = new Set(matchImported(tx, addedIds))
  applyPayeeRules(tx, addedIds.filter(id => !matched.has(id)))
  return { accountsSeen: (set.accounts ?? []).length, addedIds, messages }
}

const presentRun = (run: typeof syncRuns.$inferSelect): SyncRunView => ({
  id: run.id,
  startedAt: run.startedAt.toISOString(),
  finishedAt: run.finishedAt?.toISOString() ?? null,
  status: run.status,
  accountsSeen: run.accountsSeen,
  transactionsAdded: run.transactionsAdded,
  messages: run.messages,
})

export const recentSyncRuns = (limit = 10) =>
  db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit).all().map(presentRun)

export const isConfigured = () => Boolean(process.env.SIMPLEFIN_ACCESS_URL)

// Run one sync. `triggeredByUserId` is set for "Sync now" (which is limited to
// once every 30 minutes) and null for the schedule.
export const runSync = async (options: { triggeredByUserId?: string | null, now?: Date, fetchImpl?: typeof fetch } = {}) => {
  const accessUrl = process.env.SIMPLEFIN_ACCESS_URL
  if (!accessUrl) throw createError({ statusCode: 400, statusMessage: 'SimpleFIN is not connected (SIMPLEFIN_ACCESS_URL is not set)' })
  const now = options.now ?? new Date()

  const running = db.select().from(syncRuns)
    .where(and(eq(syncRuns.status, 'running'), gte(syncRuns.startedAt, new Date(now.getTime() - 15 * 60 * 1000))))
    .get()
  if (running) throw createError({ statusCode: 409, statusMessage: 'A sync is already running' })

  if (options.triggeredByUserId) {
    const last = db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).get()
    if (last && now.getTime() - last.startedAt.getTime() < MIN_MANUAL_INTERVAL_MS) {
      throw createError({ statusCode: 429, statusMessage: 'The bank was checked in the last 30 minutes. Try again later.' })
    }
  }

  const lastSuccess = db.select().from(syncRuns).where(eq(syncRuns.status, 'succeeded')).orderBy(desc(syncRuns.startedAt)).get()
  const run = db.insert(syncRuns).values({ startedAt: now, triggeredByUserId: options.triggeredByUserId ?? null }).returning().get()

  try {
    const set = await fetchAccountSet(accessUrl, syncWindowStart(lastSuccess?.startedAt ?? null, now), options.fetchImpl)
    const finished = db.transaction((tx) => {
      const result = importAccountSet(tx, set)
      const updated = tx.update(syncRuns).set({
        status: 'succeeded',
        finishedAt: new Date(),
        accountsSeen: result.accountsSeen,
        transactionsAdded: result.addedIds.length,
        messages: [...setMessages(set), ...result.messages],
      }).where(eq(syncRuns.id, run.id)).returning().get()
      if (options.triggeredByUserId) {
        recordAudit(tx, { actorUserId: options.triggeredByUserId, action: 'sync.run', entityType: 'syncRun', entityId: run.id })
      }
      return updated
    })
    return presentRun(finished)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    const failed = db.update(syncRuns)
      .set({ status: 'failed', finishedAt: new Date(), messages: [message] })
      .where(eq(syncRuns.id, run.id))
      .returning()
      .get()
    return presentRun(failed)
  }
}
