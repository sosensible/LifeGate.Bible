// The global message settings, edited with Church details: how many messages a
// channel may send a day, how long notifications are kept, when push is held until
// morning, and who may send to the church-wide channels.
//
// Kept apart from loadSite(), which is public: none of this is for visitors.
import { asc, eq, inArray, isNotNull, and } from 'drizzle-orm'
import { createError } from 'h3'
import { NOTIFICATION_DEFAULTS, type NotificationSettingsInput, type NotificationSettingsView } from '../../shared/notifications.ts'
import { churchNotificationSenders, people, siteSettings } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'

type Reader = Tx | typeof db

// Never throws: while the site is being built there may be no database.
export const loadNotificationSettings = (reader: Reader = db): NotificationSettingsInput => {
  try {
    const row = reader.select({
      maxPerDay: siteSettings.notifyMaxPerDay,
      keepDays: siteSettings.notifyKeepDays,
      minGapSeconds: siteSettings.notifyMinGapSeconds,
      quietStart: siteSettings.quietStart,
      quietEnd: siteSettings.quietEnd,
    }).from(siteSettings).where(eq(siteSettings.id, 'site')).get()
    const senders = reader.select({ userId: churchNotificationSenders.userId }).from(churchNotificationSenders).all()
    return { ...(row ?? NOTIFICATION_DEFAULTS), senderUserIds: senders.map(sender => sender.userId).sort() }
  }
  catch {
    return { ...NOTIFICATION_DEFAULTS, senderUserIds: [] }
  }
}

// Members who have an account: the only people who can be given the right to send.
export const listSenderCandidates = (reader: Reader = db) =>
  reader.select({ userId: people.userId, firstName: people.firstName, lastName: people.lastName })
    .from(people).where(and(isNotNull(people.userId), eq(people.kind, 'member')))
    .orderBy(asc(people.lastName), asc(people.firstName)).all()
    .map(row => ({ userId: row.userId!, name: `${row.firstName} ${row.lastName}` }))

export const loadNotificationSettingsView = (reader: Reader = db): NotificationSettingsView => ({
  ...loadNotificationSettings(reader),
  candidates: listSenderCandidates(reader),
})

// Returns the names of the fields that changed, for the audit log.
export const updateNotificationSettings = (tx: Tx, input: NotificationSettingsInput) => {
  const current = loadNotificationSettings(tx)
  const wanted = [...new Set(input.senderUserIds)].sort()

  if (wanted.length) {
    const valid = new Set(listSenderCandidates(tx).map(candidate => candidate.userId))
    if (wanted.some(userId => !valid.has(userId))) {
      throw createError({ statusCode: 400, statusMessage: 'Only a member with an account can be chosen to send announcements' })
    }
  }

  const fields: string[] = []
  if (input.maxPerDay !== current.maxPerDay) fields.push('maxPerDay')
  if (input.keepDays !== current.keepDays) fields.push('keepDays')
  if (input.minGapSeconds !== current.minGapSeconds) fields.push('minGapSeconds')
  if (input.quietStart !== current.quietStart) fields.push('quietStart')
  if (input.quietEnd !== current.quietEnd) fields.push('quietEnd')
  if (JSON.stringify(wanted) !== JSON.stringify(current.senderUserIds)) fields.push('senderUserIds')

  if (fields.some(field => field !== 'senderUserIds')) {
    tx.update(siteSettings).set({
      notifyMaxPerDay: input.maxPerDay,
      notifyKeepDays: input.keepDays,
      notifyMinGapSeconds: input.minGapSeconds,
      quietStart: input.quietStart,
      quietEnd: input.quietEnd,
    }).where(eq(siteSettings.id, 'site')).run()
  }
  if (fields.includes('senderUserIds')) {
    const keep = new Set(wanted)
    const existing = current.senderUserIds
    const drop = existing.filter(userId => !keep.has(userId))
    if (drop.length) tx.delete(churchNotificationSenders).where(inArray(churchNotificationSenders.userId, drop)).run()
    const add = wanted.filter(userId => !existing.includes(userId))
    if (add.length) tx.insert(churchNotificationSenders).values(add.map(userId => ({ userId }))).run()
  }
  return fields
}
