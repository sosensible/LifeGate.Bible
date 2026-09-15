// SimpleFIN import and sync, with fetch stubbed so nothing leaves the machine.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-simplefin-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.CHURCH_TIME_ZONE = 'America/Detroit'

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let simplefin: typeof import('../../server/lib/simplefin')
let protocol: typeof import('../../server/lib/simplefin-protocol')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  simplefin = await import('../../server/lib/simplefin')
  protocol = await import('../../server/lib/simplefin-protocol')
})

afterAll(() => {
  delete process.env.SIMPLEFIN_ACCESS_URL
  rmSync(dir, { recursive: true, force: true })
})

// 2026-03-02 12:00 UTC
const noonMarch2 = Date.UTC(2026, 2, 2, 12) / 1000

const accountSet = (transactions: Array<Record<string, unknown>>, balance = '1520.25') => ({
  errlist: [{ code: 'con.auth', msg: 'First Bank needs you to sign in again' }],
  connections: [{ conn_id: 'conn-1', name: 'First Bank' }],
  accounts: [
    { id: 'acct-checking', name: 'Operating Checking', conn_id: 'conn-1', currency: 'USD', balance, 'balance-date': noonMarch2, transactions },
    { id: 'acct-eur', name: 'Euro account', currency: 'EUR', balance: '1.00', 'balance-date': noonMarch2 },
  ],
})

const fakeFetch = (body: unknown, calls: string[] = []) =>
  (async (url: string | URL, init?: RequestInit) => {
    calls.push(`${String(url)} ${JSON.stringify(init?.headers ?? {})}`)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

describe('simplefin helpers', () => {
  it('moves credentials out of the access URL into a Basic header', () => {
    const { baseUrl, authorization } = protocol.parseAccessUrl('https://user:p%40ss@bridge.example.org/simplefin/')
    expect(baseUrl).toBe('https://bridge.example.org/simplefin')
    expect(authorization).toBe(`Basic ${Buffer.from('user:p@ss').toString('base64')}`)
  })

  it('reads 90 days the first time, then from a week before the last good sync', () => {
    const now = new Date('2026-09-14T12:00:00Z')
    expect(protocol.syncWindowStart(null, now).toISOString()).toBe('2026-06-16T12:00:00.000Z')
    expect(protocol.syncWindowStart(new Date('2026-09-13T12:00:00Z'), now).toISOString()).toBe('2026-09-06T12:00:00.000Z')
    expect(protocol.syncWindowStart(new Date('2025-01-01T00:00:00Z'), now).toISOString()).toBe('2026-06-16T12:00:00.000Z')
  })

  it('dates transactions on the church’s calendar', () => {
    // 2026-03-02 02:00 UTC is still March 1 in Michigan.
    expect(protocol.epochToDate(Date.UTC(2026, 2, 2, 2) / 1000)).toBe('2026-03-01')
  })
})

describe('importing', () => {
  it('stores accounts and posted transactions once, skipping pending and foreign-currency ones', async () => {
    const { eq } = await import('drizzle-orm')
    db.insert(schema.payeeRules).values({ matchText: 'consumers energy', payee: 'Consumers Energy', categoryId: null }).run()

    const set = accountSet([
      { id: 't1', posted: noonMarch2, amount: '-84.10', description: 'CONSUMERS ENERGY PAYMENT' },
      { id: 't2', posted: noonMarch2, amount: '2500.00', description: 'DEPOSIT' },
      { id: 't3', posted: 0, amount: '-5.00', description: 'PENDING COFFEE', pending: true },
    ])

    const first = db.transaction(tx => simplefin.importAccountSet(tx, set))
    expect(first.accountsSeen).toBe(2)
    expect(first.addedIds).toHaveLength(2)
    expect(first.messages).toEqual(['Skipped Euro account: only US dollar accounts are supported'])
    expect(simplefin.setMessages(set)).toEqual(['First Bank needs you to sign in again'])

    const again = db.transaction(tx => simplefin.importAccountSet(tx, accountSet(set.accounts[0]!.transactions, '1400.00')))
    expect(again.addedIds).toHaveLength(0)

    const account = db.select().from(schema.financeAccounts).where(eq(schema.financeAccounts.externalId, 'acct-checking')).get()!
    expect(account).toMatchObject({ source: 'simplefin', kind: 'checking', institution: 'First Bank', balanceCents: 140_000 })

    const stored = db.select().from(schema.financeTransactions).where(eq(schema.financeTransactions.accountId, account.id)).all()
    expect(stored).toHaveLength(2)
    const power = stored.find(t => t.externalId === 't1')!
    expect(power).toMatchObject({ amountCents: -8_410, postedOn: '2026-03-02', bankDescription: 'CONSUMERS ENERGY PAYMENT', payee: 'Consumers Energy' })
    const lines = db.select().from(schema.transactionSplits).where(eq(schema.transactionSplits.transactionId, power.id)).all()
    expect(lines).toEqual([expect.objectContaining({ categoryId: null, amountCents: -8_410 })])
  })
})

describe('sync runs', () => {
  it('records a successful run with SimpleFIN’s messages, and limits Sync now to every 30 minutes', async () => {
    process.env.SIMPLEFIN_ACCESS_URL = 'https://user:secret@bridge.example.org/simplefin'
    const user = db.insert(schema.user).values({ id: crypto.randomUUID(), name: 'T', email: 'treasurer@example.org', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }).returning().get().id
    const calls: string[] = []
    const now = new Date('2026-03-03T12:00:00Z')

    const run = await simplefin.runSync({ triggeredByUserId: user, now, fetchImpl: fakeFetch(accountSet([
      { id: 't9', posted: noonMarch2, amount: '-12.00', description: 'HARDWARE STORE' },
    ]), calls) })
    expect(run).toMatchObject({ status: 'succeeded', accountsSeen: 2, transactionsAdded: 1 })
    expect(run.messages).toContain('First Bank needs you to sign in again')
    expect(calls[0]).toContain('https://bridge.example.org/simplefin/accounts?version=2&start-date=')
    expect(calls[0]).not.toContain('secret@')

    await expect(simplefin.runSync({ triggeredByUserId: user, now: new Date(now.getTime() + 10 * 60 * 1000), fetchImpl: fakeFetch({ accounts: [] }) }))
      .rejects.toMatchObject({ statusCode: 429 })

    // The schedule is not limited.
    const scheduled = await simplefin.runSync({ now: new Date(now.getTime() + 11 * 60 * 1000), fetchImpl: fakeFetch({ accounts: [] }) })
    expect(scheduled.status).toBe('succeeded')
  })

  it('records a failed run instead of throwing when the bank cannot be reached', async () => {
    process.env.SIMPLEFIN_ACCESS_URL = 'https://user:secret@bridge.example.org/simplefin'
    const failing = (async () => new Response('nope', { status: 403 })) as typeof fetch
    const run = await simplefin.runSync({ now: new Date('2026-03-05T12:00:00Z'), fetchImpl: failing })
    expect(run.status).toBe('failed')
    expect(run.messages[0]).toMatch(/revoked/)
  })

  it('refuses to run without an access URL', async () => {
    delete process.env.SIMPLEFIN_ACCESS_URL
    await expect(simplefin.runSync()).rejects.toMatchObject({ statusCode: 400 })
  })
})
