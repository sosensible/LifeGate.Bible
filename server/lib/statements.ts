// Year-end giving statements: what each giver gave in a year, from closed
// counts only, and what has been sent.
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { UNDESIGNATED_LABEL, type StatementListView, type StatementRow, type StatementSettingsInput, type StatementSettingsView, type StatementView } from '../../shared/giving.ts'
import { categories, categoryGroups, gifts, givers, offeringCounts, statementDeliveries, statementSettings } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'

type Reader = Tx | typeof db

const SETTINGS_ID = 'church'

const inYear = (year: number) => and(
  eq(offeringCounts.status, 'closed'),
  isNotNull(gifts.giverId),
  gte(gifts.receivedOn, `${year}-01-01`),
  lte(gifts.receivedOn, `${year}-12-31`),
)

export const statementsFor = (year: number, giverIds: string[], reader: Reader = db): StatementView[] => {
  if (!giverIds.length) return []
  const rows = reader
    .select({ gift: gifts, categoryName: categories.name, categorySort: categories.sortOrder, groupSort: categoryGroups.sortOrder })
    .from(gifts)
    .innerJoin(offeringCounts, eq(offeringCounts.id, gifts.countId))
    .leftJoin(categories, eq(categories.id, gifts.categoryId))
    .leftJoin(categoryGroups, eq(categoryGroups.id, categories.groupId))
    .where(and(inYear(year), inArray(gifts.giverId, giverIds)))
    .orderBy(asc(gifts.receivedOn), asc(gifts.createdAt))
    .all()
  const people = reader.select().from(givers).where(inArray(givers.id, giverIds)).orderBy(asc(givers.statementName)).all()

  return people.map((giver) => {
    const own = rows.filter(row => row.gift.giverId === giver.id)
    // Undesignated giving first, then each designated category in budget order.
    const byCategory = new Map<string | null, { givenTo: string, amountCents: number, sort: [number, number] }>()
    for (const { gift, categoryName, categorySort, groupSort } of own) {
      const line = byCategory.get(gift.categoryId) ?? { givenTo: categoryName ?? UNDESIGNATED_LABEL, amountCents: 0, sort: gift.categoryId ? [groupSort ?? 0, categorySort ?? 0] : [-1, -1] }
      line.amountCents += gift.amountCents
      byCategory.set(gift.categoryId, line)
    }
    return {
      year,
      giver: { id: giver.id, statementName: giver.statementName, mailingAddress: giver.mailingAddress, email: giver.email },
      gifts: own.map(({ gift, categoryName }) => ({
        receivedOn: gift.receivedOn,
        givenTo: categoryName ?? UNDESIGNATED_LABEL,
        method: gift.method,
        checkNumber: gift.checkNumber,
        amountCents: gift.amountCents,
      })),
      designations: [...byCategory.values()]
        .sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1] || a.givenTo.localeCompare(b.givenTo))
        .map(({ givenTo, amountCents }) => ({ givenTo, amountCents })),
      totalCents: own.reduce((sum, row) => sum + row.gift.amountCents, 0),
    }
  })
}

export const statementFor = (year: number, giverId: string, reader: Reader = db) => {
  const statement = statementsFor(year, [giverId], reader)[0]
  if (!statement) throw createError({ statusCode: 404, statusMessage: 'Giving record not found' })
  return statement
}

// Open counts dated in the year, or holding gifts received in it (a January
// count can hold a check mailed by December 31).
export const openCountsIn = (year: number, reader: Reader = db) =>
  reader.select({ n: sql<number>`count(*)` }).from(offeringCounts)
    .where(and(
      eq(offeringCounts.status, 'open'),
      sql`(${offeringCounts.countedOn} between ${`${year}-01-01`} and ${`${year}-12-31`}
        or exists (select 1 from ${gifts} where ${gifts.countId} = ${offeringCounts.id}
          and ${gifts.receivedOn} between ${`${year}-01-01`} and ${`${year}-12-31`}))`,
    ))
    .get()?.n ?? 0

// Everyone who gave in the year, with what was last sent to them.
export const statementRows = (year: number, reader: Reader = db): StatementListView => {
  const totals = reader
    .select({ giverId: gifts.giverId, n: sql<number>`count(*)`, cents: sql<number>`sum(${gifts.amountCents})` })
    .from(gifts)
    .innerJoin(offeringCounts, eq(offeringCounts.id, gifts.countId))
    .where(inYear(year))
    .groupBy(gifts.giverId)
    .all()
  const ids = totals.map(t => t.giverId!).filter(Boolean)
  const records = ids.length ? reader.select().from(givers).where(inArray(givers.id, ids)).all() : []
  const deliveries = ids.length
    ? reader.select().from(statementDeliveries)
        .where(and(eq(statementDeliveries.year, year), inArray(statementDeliveries.giverId, ids)))
        .orderBy(desc(statementDeliveries.createdAt), desc(sql`${statementDeliveries}.rowid`))
        .all()
    : []

  const rows: StatementRow[] = records.map((giver) => {
    const total = totals.find(t => t.giverId === giver.id)!
    const last = deliveries.find(d => d.giverId === giver.id)
    const lastSent = deliveries.find(d => d.giverId === giver.id && d.status === 'sent')
    return {
      giverId: giver.id,
      statementName: giver.statementName,
      delivery: giver.delivery,
      email: giver.email,
      hasAddress: Boolean(giver.mailingAddress?.trim()),
      archived: Boolean(giver.archivedAt),
      giftCount: total.n,
      totalCents: total.cents,
      lastDelivery: last ? { method: last.method, status: last.status, at: last.createdAt.toISOString(), error: last.error } : null,
      changedSinceSent: Boolean(lastSent && lastSent.totalCents !== total.cents),
    }
  }).sort((a, b) => a.statementName.localeCompare(b.statementName))

  return { year, rows, openCounts: openCountsIn(year, reader) }
}

export const recordDelivery = (
  tx: Tx | typeof db,
  entry: { giverId: string, year: number, method: 'email' | 'print', sentTo: string | null, status: 'sent' | 'failed', error: string | null, totalCents: number, sentByUserId: string },
) => {
  tx.insert(statementDeliveries).values(entry).run()
}

// ---- Settings ---------------------------------------------------------------

export const loadStatementSettings = (reader: Reader = db): StatementSettingsView => {
  const row = reader.select().from(statementSettings).where(eq(statementSettings.id, SETTINGS_ID)).get()
  return {
    legalName: row?.legalName ?? 'Lifegate Baptist Church',
    mailingAddress: row?.mailingAddress ?? null,
    ein: row?.ein ?? null,
    signerName: row?.signerName ?? null,
    signerTitle: row?.signerTitle ?? null,
    closingMessage: row?.closingMessage ?? null,
    emailSubject: row?.emailSubject ?? null,
    updatedAt: (row?.updatedAt ?? new Date(0)).toISOString(),
  }
}

export const saveStatementSettings = (tx: Tx, input: StatementSettingsInput) => {
  const current = loadStatementSettings(tx)
  const fields = (Object.keys(input) as Array<keyof StatementSettingsInput>).filter(f => input[f] !== current[f])
  if (!fields.length) return fields
  tx.insert(statementSettings).values({ id: SETTINGS_ID, ...input })
    .onConflictDoUpdate({ target: statementSettings.id, set: { ...input, updatedAt: new Date() } })
    .run()
  return fields
}
