// Reading the audit log for the viewer: filtered, paged, with names instead of ids.
import { and, count, desc, eq, gte, inArray, lt, ne, sql, type SQL } from 'drizzle-orm'
import type { AuditEntryView } from '../../shared/audit.ts'
import { auditLog, categories, categoryGroups, financeAccounts, financeTransactions, givers, households, liveMeetings, ministries, offeringCounts, missionaries, missionOrganizations, people, recurringTransactions, sermonSeries, sermons, user } from '../database/schema/index.ts'
import { db } from './db.ts'

export interface AuditQuery {
  page: number
  pageSize: number
  entityType?: string
  action?: string
  actorId?: string
  from?: string
  to?: string
  hideSignIns: boolean
}

// Local midnight at the start of a YYYY-MM-DD day.
const startOfDay = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year!, month! - 1, day)
}

const labelsFor = (entityType: string, ids: string[]): Map<string, string> => {
  if (!ids.length) return new Map()
  switch (entityType) {
    case 'person':
      return new Map(db.select({ id: people.id, first: people.firstName, last: people.lastName }).from(people)
        .where(inArray(people.id, ids)).all().map(r => [r.id, `${r.first} ${r.last}`]))
    case 'household':
      return new Map(db.select({ id: households.id, name: households.name }).from(households)
        .where(inArray(households.id, ids)).all().map(r => [r.id, r.name]))
    case 'ministry':
      return new Map(db.select({ id: ministries.id, name: ministries.name }).from(ministries)
        .where(inArray(ministries.id, ids)).all().map(r => [r.id, r.name]))
    case 'sermon':
      return new Map(db.select({ id: sermons.id, title: sermons.title }).from(sermons)
        .where(inArray(sermons.id, ids)).all().map(r => [r.id, r.title]))
    case 'liveMeeting':
      return new Map(db.select({ id: liveMeetings.id, title: liveMeetings.title }).from(liveMeetings)
        .where(inArray(liveMeetings.id, ids)).all().map(r => [r.id, r.title]))
    case 'sermonSeries':
      return new Map(db.select({ id: sermonSeries.id, name: sermonSeries.name }).from(sermonSeries)
        .where(inArray(sermonSeries.id, ids)).all().map(r => [r.id, r.name]))
    case 'missionary':
      return new Map(db.select({ id: missionaries.id, name: missionaries.name }).from(missionaries)
        .where(inArray(missionaries.id, ids)).all().map(r => [r.id, r.name]))
    case 'missionOrganization':
      return new Map(db.select({ id: missionOrganizations.id, name: missionOrganizations.name }).from(missionOrganizations)
        .where(inArray(missionOrganizations.id, ids)).all().map(r => [r.id, r.name]))
    // Stewardship: names and dates only. Admins read this log and have no
    // financial access, so no amounts, payees or bank wording.
    case 'financeAccount':
      return new Map(db.select({ id: financeAccounts.id, name: financeAccounts.name }).from(financeAccounts)
        .where(inArray(financeAccounts.id, ids)).all().map(r => [r.id, r.name]))
    case 'transaction':
      return new Map(db.select({ id: financeTransactions.id, postedOn: financeTransactions.postedOn, account: financeAccounts.name })
        .from(financeTransactions)
        .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
        .where(inArray(financeTransactions.id, ids)).all().map(r => [r.id, `${r.account}, ${r.postedOn}`]))
    case 'categoryGroup':
      return new Map(db.select({ id: categoryGroups.id, name: categoryGroups.name }).from(categoryGroups)
        .where(inArray(categoryGroups.id, ids)).all().map(r => [r.id, r.name]))
    case 'category':
      return new Map(db.select({ id: categories.id, name: categories.name }).from(categories)
        .where(inArray(categories.id, ids)).all().map(r => [r.id, r.name]))
    case 'recurring':
      // A recurring payment in a sensitive category (e.g. Benevolence) can name a person.
      return new Map(db.select({ id: recurringTransactions.id, name: recurringTransactions.name, isSensitive: categories.isSensitive })
        .from(recurringTransactions)
        .leftJoin(categories, eq(categories.id, recurringTransactions.categoryId))
        .where(inArray(recurringTransactions.id, ids)).all()
        .map(r => [r.id, r.isSensitive ? 'Recurring transaction (sensitive category)' : r.name]))
    // Giving: admins read this log and must not learn who gives.
    case 'giver':
      return new Map(db.select({ id: givers.id }).from(givers)
        .where(inArray(givers.id, ids)).all().map(r => [r.id, 'Giving record']))
    case 'count':
      return new Map(db.select({ id: offeringCounts.id, countedOn: offeringCounts.countedOn, label: offeringCounts.label }).from(offeringCounts)
        .where(inArray(offeringCounts.id, ids)).all().map(r => [r.id, r.label ? `${r.label}, ${r.countedOn}` : r.countedOn]))
    case 'user':
      return new Map(db.select({ id: user.id, email: user.email }).from(user)
        .where(inArray(user.id, ids)).all().map(r => [r.id, r.email]))
    default:
      return new Map()
  }
}

export const queryAudit = (query: AuditQuery) => {
  const conditions: SQL[] = []
  if (query.entityType) conditions.push(eq(auditLog.entityType, query.entityType))
  if (query.action) conditions.push(eq(auditLog.action, query.action))
  if (query.actorId) conditions.push(eq(auditLog.actorUserId, query.actorId))
  if (query.from) conditions.push(gte(auditLog.createdAt, startOfDay(query.from)))
  if (query.to) {
    const next = startOfDay(query.to)
    next.setDate(next.getDate() + 1)
    conditions.push(lt(auditLog.createdAt, next))
  }
  if (query.hideSignIns) conditions.push(ne(auditLog.action, 'auth.signIn'))
  const where = conditions.length ? and(...conditions) : undefined

  const total = db.select({ n: count() }).from(auditLog).where(where).get()?.n ?? 0

  const rows = db
    .select({ entry: auditLog, actorName: user.name, actorEmail: user.email })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorUserId, user.id))
    .where(where)
    // Timestamps are whole seconds; SQLite's rowid keeps entries written in
    // the same second in the order they happened (ids are random UUIDs).
    .orderBy(desc(auditLog.createdAt), desc(sql`${auditLog}.rowid`))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all()

  const idsByType = new Map<string, string[]>()
  for (const { entry } of rows) {
    if (!entry.entityId) continue
    idsByType.set(entry.entityType, [...(idsByType.get(entry.entityType) ?? []), entry.entityId])
  }
  const labels = new Map([...idsByType].map(([type, ids]) => [type, labelsFor(type, [...new Set(ids)])]))

  const entries: AuditEntryView[] = rows.map(({ entry, actorName, actorEmail }) => {
    const details = (entry.details ?? {}) as { fields?: string[], note?: string }
    return {
      id: entry.id,
      at: entry.createdAt.toISOString(),
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityLabel: entry.entityId ? labels.get(entry.entityType)?.get(entry.entityId) ?? null : null,
      actor: entry.actorUserId && actorEmail ? { id: entry.actorUserId, label: actorName ? `${actorName} (${actorEmail})` : actorEmail } : null,
      fields: details.fields ?? [],
      note: details.note ?? null,
    }
  })

  return { entries, total, page: query.page, pageSize: query.pageSize }
}

// Filter choices: everyone who has an entry, and every action that occurs.
export const auditFilterOptions = () => ({
  actors: db.selectDistinct({ id: user.id, name: user.name, email: user.email })
    .from(auditLog).innerJoin(user, eq(auditLog.actorUserId, user.id)).all()
    .map(a => ({ id: a.id, label: `${a.name} (${a.email})` }))
    .sort((a, b) => a.label.localeCompare(b.label)),
  actions: db.selectDistinct({ action: auditLog.action }).from(auditLog).all().map(a => a.action).sort(),
  entityTypes: db.selectDistinct({ type: auditLog.entityType }).from(auditLog).all().map(t => t.type).sort(),
})
