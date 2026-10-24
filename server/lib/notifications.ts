// Notifications: channels, messages, and each person's log. See
// docs/specs/push-notifications.md.
//
// Three rules govern the file, the same ones as ministry lists:
//
// 1. Authority comes from the roster on every call (ministry_members.isLeader), so
//    naming a new leader moves the right to send, and someone who leaves a
//    ministry stops receiving its messages and can no longer read the old ones.
// 2. A person's log is theirs alone. Leaders see how many a message reached and how
//    many have read it, never who. Staff and administrators see nothing of it.
// 3. What the site writes itself (a task assigned) says what happened and carries
//    none of the task's text.
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { fromDate, toCalendarDate, toCalendarDateTime, toZoned } from '@internationalized/date'
import {
  type AudienceView,
  type ChannelInput,
  type ChannelPatch,
  type ChannelsPayload,
  type ChannelView,
  type LogPayload,
  type NotificationView,
  type SendInput,
  type SentPayload,
  type SentView,
  type TaskNotify,
} from '../../shared/notifications.ts'
import {
  channelMutes,
  churchNotificationSenders,
  ministries,
  ministryLists,
  ministryListItems,
  ministryMembers,
  notificationChannels,
  notificationReceipts,
  notifications,
  people,
  user,
} from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'
import { renderActionEmail, sendMailInBackground } from './mail.ts'
import { loadAssignable, loadListViewer, type ListViewer } from './ministry-lists.ts'
import { loadNotificationSettings } from './notification-settings.ts'

type Reader = Tx | typeof db
type ChannelRow = typeof notificationChannels.$inferSelect

const DAY = 86_400_000

// ---------------------------------------------------------------------------
// Who is looking

export interface NotifyViewer extends ListViewer {
  userId: string
  // A signed-in member of the church (the member area), whatever else they are.
  isMember: boolean
  // May send to the church-wide channels (chosen with Church details).
  isChurchSender: boolean
}

export const loadNotifyViewer = (userId: string, isMember: boolean, reader: Reader = db): NotifyViewer => {
  const base = loadListViewer(userId, { isMember, staffView: false, staffViewLeadersOnly: false }, reader)
  const sender = isMember
    ? reader.select({ userId: churchNotificationSenders.userId }).from(churchNotificationSenders).where(eq(churchNotificationSenders.userId, userId)).get()
    : undefined
  return { ...base, userId, isMember, isChurchSender: Boolean(sender) }
}

// ---------------------------------------------------------------------------
// The rules. Exported so the tests can assert every cell of the matrix.

interface ChannelRef { ministryId: string | null, archivedAt?: Date | null }

// Members of the ministry see its channels; every member sees the church-wide ones.
// Staff see nothing of a ministry's channels for being staff.
export const canSeeChannel = (viewer: NotifyViewer, channel: ChannelRef) =>
  channel.ministryId ? viewer.serves.has(channel.ministryId) : viewer.isMember

export const canSendTo = (viewer: NotifyViewer, channel: ChannelRef) =>
  !channel.archivedAt && (channel.ministryId ? viewer.leads.has(channel.ministryId) : viewer.isChurchSender)

// Leaders of the ministry add and rename its channels and choose how tasks are announced.
export const canManageChannels = (viewer: NotifyViewer, ministryId: string) => viewer.leads.has(ministryId)

// A list's own choice wins; otherwise the ministry's.
export const taskNotifyFor = (list: TaskNotify | null, ministry: TaskNotify): TaskNotify => list ?? ministry

// ---------------------------------------------------------------------------

const notFound = () => createError({ statusCode: 404, statusMessage: 'Not found' })
const forbidden = () => createError({ statusCode: 403, statusMessage: 'Not allowed' })

// Midnight at the start of today in the church's own time zone.
export const startOfChurchDay = (now: Date, zone = process.env.CHURCH_TIME_ZONE || 'America/Detroit') =>
  toZoned(toCalendarDateTime(toCalendarDate(fromDate(now, zone))), zone).toDate()

const iso = (date: Date) => date.toISOString()

// A ministry's id from its slug in the address; 404 when there is none.
export const ministryIdOf = (slug: string, reader: Reader = db) => {
  const ministry = reader.select({ id: ministries.id }).from(ministries).where(eq(ministries.slug, slug)).get()
  if (!ministry) throw createError({ statusCode: 404, statusMessage: 'Ministry not found' })
  return ministry.id
}

// ---------------------------------------------------------------------------
// Channels

const findChannel = (reader: Reader, channelId: string) =>
  reader.select().from(notificationChannels).where(eq(notificationChannels.id, channelId)).get()

const viewOf = (channel: ChannelRow, ministry: { slug: string, name: string } | null, muted: ReadonlySet<string>): ChannelView => ({
  id: channel.id,
  ministry,
  name: channel.name,
  description: channel.description,
  archived: Boolean(channel.archivedAt),
  following: !muted.has(channel.id),
})

const mutedBy = (reader: Reader, userId: string) =>
  new Set(reader.select({ channelId: channelMutes.channelId }).from(channelMutes).where(eq(channelMutes.userId, userId)).all().map(row => row.channelId))

// A ministry's channels, for the people who serve in it. Leaders also see the retired ones.
export const loadMinistryChannels = (viewer: NotifyViewer, ministryId: string, reader: Reader = db): ChannelsPayload => {
  const ministry = reader.select({ slug: ministries.slug, name: ministries.name, taskNotify: ministries.taskNotify }).from(ministries).where(eq(ministries.id, ministryId)).get()
  if (!ministry || !viewer.serves.has(ministryId)) throw notFound()
  const canManage = canManageChannels(viewer, ministryId)
  const muted = mutedBy(reader, viewer.userId)
  const rows = reader.select().from(notificationChannels)
    .where(and(eq(notificationChannels.ministryId, ministryId), canManage ? undefined : isNull(notificationChannels.archivedAt)))
    .orderBy(asc(notificationChannels.sortOrder), asc(notificationChannels.createdAt)).all()
  return {
    channels: rows.map(row => viewOf(row, { slug: ministry.slug, name: ministry.name }, muted)),
    canManage,
    taskNotify: ministry.taskNotify,
    audience: canManage ? loadAudience(ministryId, reader) : null,
  }
}

// Who a ministry's messages can reach: the roster people the leaders already see,
// each marked by whether they have an account. A person who chose not to be listed
// still receives messages and is counted, but is not named here.
export const loadAudience = (ministryId: string, reader: Reader = db): AudienceView => {
  const total = reader.select({ n: count() }).from(ministryMembers).where(eq(ministryMembers.ministryId, ministryId)).get()?.n ?? 0
  const reachable = reader.select({ n: count() }).from(ministryMembers).innerJoin(people, eq(people.id, ministryMembers.personId))
    .where(and(eq(ministryMembers.ministryId, ministryId), isNotNull(people.userId))).get()?.n ?? 0
  return {
    people: loadAssignable(ministryId, reader).map(person => ({ id: person.id, name: person.name, isLeader: person.isLeader, canReceive: person.canNotify })),
    reachable,
    total,
  }
}

// Every channel this person could receive: the ministries they serve in, and the
// church-wide ones. Retired channels are left out.
export const loadMyChannels = (viewer: NotifyViewer, reader: Reader = db): Array<ChannelView & { canSend: boolean }> => {
  if (!viewer.isMember) return []
  const served = [...viewer.serves]
  const rows = reader.select({ channel: notificationChannels, slug: ministries.slug, ministryName: ministries.name })
    .from(notificationChannels).leftJoin(ministries, eq(ministries.id, notificationChannels.ministryId))
    .where(and(
      isNull(notificationChannels.archivedAt),
      served.length ? sql`(${notificationChannels.ministryId} IS NULL OR ${inArray(notificationChannels.ministryId, served)})` : isNull(notificationChannels.ministryId),
    ))
    .orderBy(asc(ministries.name), asc(notificationChannels.sortOrder), asc(notificationChannels.createdAt)).all()
  const muted = mutedBy(reader, viewer.userId)
  return rows.map(row => ({
    ...viewOf(row.channel, row.slug ? { slug: row.slug, name: row.ministryName! } : null, muted),
    canSend: canSendTo(viewer, row.channel),
  }))
}

// Following is the default; this mutes or unmutes. Only for a channel the person may see.
export const setFollowing = (tx: Tx, viewer: NotifyViewer, channelId: string, following: boolean) => {
  const channel = findChannel(tx, channelId)
  if (!channel || !canSeeChannel(viewer, channel)) throw notFound()
  if (following) tx.delete(channelMutes).where(and(eq(channelMutes.userId, viewer.userId), eq(channelMutes.channelId, channelId))).run()
  else tx.insert(channelMutes).values({ userId: viewer.userId, channelId }).onConflictDoNothing().run()
}

const assertNameFree = (reader: Reader, ministryId: string | null, name: string, exceptId?: string) => {
  const taken = reader.select({ id: notificationChannels.id, name: notificationChannels.name }).from(notificationChannels)
    .where(and(ministryId ? eq(notificationChannels.ministryId, ministryId) : isNull(notificationChannels.ministryId), isNull(notificationChannels.archivedAt))).all()
  if (taken.some(row => row.id !== exceptId && row.name.toLowerCase() === name.toLowerCase())) {
    throw createError({ statusCode: 409, statusMessage: 'There is already a channel with that name' })
  }
}

const insertChannel = (tx: Tx, ministryId: string | null, input: ChannelInput) => {
  assertNameFree(tx, ministryId, input.name)
  const last = tx.select({ max: sql<number | null>`max(${notificationChannels.sortOrder})` }).from(notificationChannels)
    .where(ministryId ? eq(notificationChannels.ministryId, ministryId) : isNull(notificationChannels.ministryId)).get()?.max ?? -1
  return tx.insert(notificationChannels).values({ ministryId, name: input.name, description: input.description, sortOrder: last + 1 })
    .returning({ id: notificationChannels.id }).get().id
}

const changeChannel = (tx: Tx, channel: ChannelRow, patch: ChannelPatch) => {
  const changes: Partial<typeof notificationChannels.$inferInsert> = {}
  if (patch.name !== undefined) {
    assertNameFree(tx, channel.ministryId, patch.name, channel.id)
    changes.name = patch.name
  }
  if (patch.description !== undefined) changes.description = patch.description
  if (patch.archived !== undefined) changes.archivedAt = patch.archived ? new Date() : null
  if (Object.keys(changes).length) tx.update(notificationChannels).set(changes).where(eq(notificationChannels.id, channel.id)).run()
  return Object.keys(patch)
}

export const createChannel = (tx: Tx, viewer: NotifyViewer, ministryId: string, input: ChannelInput) => {
  if (!tx.select({ id: ministries.id }).from(ministries).where(eq(ministries.id, ministryId)).get()) throw notFound()
  if (!canManageChannels(viewer, ministryId)) throw forbidden()
  return insertChannel(tx, ministryId, input)
}

export const updateChannel = (tx: Tx, viewer: NotifyViewer, channelId: string, patch: ChannelPatch) => {
  const channel = findChannel(tx, channelId)
  // A channel of a ministry the person has nothing to do with is not confirmed to exist.
  if (!channel || !channel.ministryId || !viewer.serves.has(channel.ministryId)) throw notFound()
  if (!canManageChannels(viewer, channel.ministryId)) throw forbidden()
  return changeChannel(tx, channel, patch)
}

// Church-wide channels are kept by whoever edits Church details; the route checks that.
export const createChurchChannel = (tx: Tx, input: ChannelInput) => insertChannel(tx, null, input)

export const updateChurchChannel = (tx: Tx, channelId: string, patch: ChannelPatch) => {
  const channel = findChannel(tx, channelId)
  if (!channel || channel.ministryId) throw notFound()
  return changeChannel(tx, channel, patch)
}

export const loadChurchChannels = (reader: Reader = db): ChannelView[] =>
  reader.select().from(notificationChannels).where(isNull(notificationChannels.ministryId))
    .orderBy(asc(notificationChannels.sortOrder), asc(notificationChannels.createdAt)).all()
    .map(row => viewOf(row, null, new Set()))

// ---------------------------------------------------------------------------
// Sending

// Who a message to this channel reaches: the people on the ministry's roster (or
// every member) who have an account and have not muted the channel, other than the
// sender. Read from the roster now, so a former member is not included.
export const recipientsOf = (reader: Reader, channel: ChannelRow, senderUserId: string | null) => {
  const rows = channel.ministryId
    ? reader.select({ userId: people.userId }).from(ministryMembers)
        .innerJoin(people, eq(people.id, ministryMembers.personId))
        .where(and(eq(ministryMembers.ministryId, channel.ministryId), isNotNull(people.userId))).all()
    : reader.select({ userId: people.userId }).from(people).where(and(isNotNull(people.userId), eq(people.kind, 'member'))).all()
  const muted = new Set(reader.select({ userId: channelMutes.userId }).from(channelMutes).where(eq(channelMutes.channelId, channel.id)).all().map(row => row.userId))
  return [...new Set(rows.map(row => row.userId!))].filter(userId => userId !== senderUserId && !muted.has(userId))
}

// Seconds left before this channel may take another message; zero when it may.
export const waitBeforeNext = (reader: Reader, channelId: string, now: Date, minGapSeconds: number) => {
  if (minGapSeconds <= 0) return 0
  const last = reader.select({ at: sql<number | null>`max(${notifications.createdAt})` }).from(notifications)
    .where(and(eq(notifications.channelId, channelId), eq(notifications.kind, 'channel'))).get()?.at
  if (last === null || last === undefined) return 0
  // Stored as whole seconds since 1970.
  const elapsed = now.getTime() / 1000 - last
  return elapsed >= minGapSeconds ? 0 : Math.ceil(minGapSeconds - Math.max(0, elapsed))
}

export const sentToday = (reader: Reader, channelId: string, now: Date) =>
  reader.select({ n: count() }).from(notifications)
    .where(and(eq(notifications.channelId, channelId), eq(notifications.kind, 'channel'), gte(notifications.createdAt, startOfChurchDay(now)))).get()?.n ?? 0

let lastPurge = 0

// Notifications older than the retention period go, with their receipts. Cheap, and
// run when something is sent or read, at most once an hour.
export const purgeExpired = (tx: Reader, now = new Date(), force = false) => {
  if (!force && now.getTime() - lastPurge < 3_600_000) return 0
  lastPurge = now.getTime()
  const { keepDays } = loadNotificationSettings(tx)
  const cutoff = new Date(now.getTime() - keepDays * DAY)
  return tx.delete(notifications).where(lt(notifications.createdAt, cutoff)).run().changes
}

export const sendToChannel = (tx: Tx, viewer: NotifyViewer, channelId: string, input: SendInput, now = new Date()) => {
  const channel = findChannel(tx, channelId)
  if (!channel || !canSeeChannel(viewer, channel)) throw notFound()
  if (channel.archivedAt) throw createError({ statusCode: 409, statusMessage: 'This channel has been retired' })
  if (!canSendTo(viewer, channel)) throw forbidden()

  const { maxPerDay, minGapSeconds } = loadNotificationSettings(tx)
  if (sentToday(tx, channelId, now) >= maxPerDay) {
    throw createError({ statusCode: 429, statusMessage: `This channel has reached today’s limit of ${maxPerDay} message${maxPerDay === 1 ? '' : 's'}. Try again tomorrow.` })
  }
  // A short pause between messages on a channel, so they reach people in the order
  // they were sent.
  const wait = waitBeforeNext(tx, channelId, now, minGapSeconds)
  if (wait > 0) {
    throw createError({ statusCode: 429, statusMessage: `Please wait ${wait} second${wait === 1 ? '' : 's'} before sending another message to this channel.` })
  }

  const ministry = channel.ministryId
    ? tx.select({ slug: ministries.slug }).from(ministries).where(eq(ministries.id, channel.ministryId)).get()
    : undefined
  // Tapping it goes to the ministry's page, or to the person's notifications.
  const url = input.url ?? (ministry ? `/ministries/${ministry.slug}` : '/me?tab=notifications')

  const id = tx.insert(notifications).values({
    kind: 'channel',
    channelId,
    ministryId: channel.ministryId,
    senderUserId: viewer.userId,
    title: input.title,
    body: input.body,
    url,
    createdAt: now,
  }).returning({ id: notifications.id }).get().id

  const recipients = recipientsOf(tx, channel, viewer.userId)
  if (recipients.length) tx.insert(notificationReceipts).values(recipients.map(userId => ({ notificationId: id, userId }))).run()
  purgeExpired(tx, now)
  return { id, recipients: recipients.length }
}

// What a leader sees of what they sent: how many it reached and how many have read it.
export const loadSent = (viewer: NotifyViewer, scope: { ministryId: string } | { churchWide: true }, now = new Date(), reader: Reader = db): SentPayload => {
  const ministryId = 'ministryId' in scope ? scope.ministryId : null
  if (ministryId ? !canManageChannels(viewer, ministryId) : !viewer.isChurchSender) throw forbidden()

  const channels = reader.select().from(notificationChannels).where(ministryId ? eq(notificationChannels.ministryId, ministryId) : isNull(notificationChannels.ministryId)).all()
  const ids = channels.map(channel => channel.id)
  const rows = ids.length
    ? reader.select({
        id: notifications.id, channelId: notifications.channelId, title: notifications.title, body: notifications.body, at: notifications.createdAt,
        recipients: sql<number>`count(${notificationReceipts.userId})`,
        read: sql<number>`count(${notificationReceipts.readAt})`,
      }).from(notifications).leftJoin(notificationReceipts, eq(notificationReceipts.notificationId, notifications.id))
        .where(and(inArray(notifications.channelId, ids), eq(notifications.kind, 'channel')))
        .groupBy(notifications.id).orderBy(desc(notifications.createdAt), sql`notifications.rowid DESC`).limit(50).all()
    : []
  const names = new Map(channels.map(channel => [channel.id, channel.name]))
  const { maxPerDay, minGapSeconds } = loadNotificationSettings(reader)
  return {
    sent: rows.map((row): SentView => ({ id: row.id, channelName: names.get(row.channelId!) ?? '', title: row.title, body: row.body, at: iso(row.at), recipients: row.recipients, read: row.read })),
    limit: maxPerDay,
    minGapSeconds,
    usedToday: Object.fromEntries(ids.map(id => [id, sentToday(reader, id, now)])),
  }
}

// ---------------------------------------------------------------------------
// A person's log

export const loadLog = (viewer: NotifyViewer, now = new Date(), reader: Reader = db): LogPayload => {
  const { keepDays } = loadNotificationSettings(reader)
  if (!viewer.isMember) return { notifications: [], unread: 0, keepDays }
  purgeExpired(reader, now)
  const rows = reader.select({
    id: notifications.id,
    kind: notifications.kind,
    ministryId: notifications.ministryId,
    title: notifications.title,
    body: notifications.body,
    url: notifications.url,
    at: notifications.createdAt,
    readAt: notificationReceipts.readAt,
    channelName: notificationChannels.name,
    ministryName: ministries.name,
  }).from(notificationReceipts)
    .innerJoin(notifications, eq(notifications.id, notificationReceipts.notificationId))
    .leftJoin(notificationChannels, eq(notificationChannels.id, notifications.channelId))
    .leftJoin(ministries, eq(ministries.id, notifications.ministryId))
    .where(and(eq(notificationReceipts.userId, viewer.userId), gte(notifications.createdAt, new Date(now.getTime() - keepDays * DAY))))
    // Messages sent in the same second keep the order they were sent in.
    .orderBy(desc(notifications.createdAt), sql`notifications.rowid DESC`).limit(200).all()

  // What came from a ministry is read only by those still serving in it. Never let
  // someone read what they can no longer see.
  const visible = rows.filter(row => !row.ministryId || viewer.serves.has(row.ministryId))
  const log = visible.slice(0, 100).map((row): NotificationView => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    url: row.url,
    at: iso(row.at),
    read: Boolean(row.readAt),
    from: row.kind === 'task'
      ? `${row.ministryName} · Tasks`
      : [row.ministryName, row.channelName].filter(Boolean).join(' · '),
  }))
  return { notifications: log, unread: visible.filter(row => !row.readAt).length, keepDays }
}

export const markRead = (tx: Tx, userId: string, input: { ids?: string[], all?: boolean }, now = new Date()) =>
  tx.update(notificationReceipts).set({ readAt: now })
    .where(and(
      eq(notificationReceipts.userId, userId),
      isNull(notificationReceipts.readAt),
      input.all ? undefined : inArray(notificationReceipts.notificationId, input.ids ?? []),
    )).run().changes

// ---------------------------------------------------------------------------
// A task given to someone

const siteOrigin = () => (process.env.BETTER_AUTH_URL || process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

// Tells the person a task was given to them, as the ministry (or the list) chose:
// by email, by a message in their Notifications, or both. Says what happened and
// nothing of the task itself. Someone with no account cannot be told, and nobody is
// told about a task they gave themselves. Returns how they were told.
export interface TaskNotice { message: boolean, email: boolean, notice: string | null }

export const notifyTaskAssigned = (reader: Reader, itemId: string, assignerPersonId: string | null, now = new Date()) => {
  const row = reader.select({
    assigneeId: ministryListItems.assigneeId,
    listTaskNotify: ministryLists.taskNotify,
    ministryId: ministries.id,
    ministryName: ministries.name,
    ministryTaskNotify: ministries.taskNotify,
    userId: people.userId,
    firstName: people.firstName,
    email: user.email,
  }).from(ministryListItems)
    .innerJoin(ministryLists, eq(ministryLists.id, ministryListItems.listId))
    .innerJoin(ministries, eq(ministries.id, ministryLists.ministryId))
    .leftJoin(people, eq(people.id, ministryListItems.assigneeId))
    .leftJoin(user, eq(user.id, people.userId))
    .where(eq(ministryListItems.id, itemId)).get()

  // `notice` is for the leader who gave the task: set when the person cannot be told.
  const told: TaskNotice = { message: false, email: false, notice: null }
  if (!row?.assigneeId || row.assigneeId === assignerPersonId) return told
  if (!row.userId) {
    told.notice = `${row.firstName} has no sign-in account, so they will not be told about this task. Let them know yourself.`
    return told
  }

  const mode = taskNotifyFor(row.listTaskNotify, row.ministryTaskNotify)
  const title = `New task in ${row.ministryName}`

  if (mode === 'message' || mode === 'both') {
    const id = reader.insert(notifications).values({
      kind: 'task',
      ministryId: row.ministryId,
      title,
      body: 'A leader has given you a task. Open it to see what it is.',
      url: '/my-lists',
      createdAt: now,
    }).returning({ id: notifications.id }).get().id
    reader.insert(notificationReceipts).values({ notificationId: id, userId: row.userId }).run()
    told.message = true
  }
  if ((mode === 'email' || mode === 'both') && row.email) {
    sendMailInBackground({
      to: row.email,
      subject: title,
      ...renderActionEmail({
        heading: 'You have a new task',
        intro: `A leader of ${row.ministryName} has given you a task.`,
        actionLabel: 'See my tasks',
        actionUrl: `${siteOrigin()}/my-lists`,
        footnote: 'You are getting this because you serve in this ministry. The ministry’s leaders choose how tasks are announced.',
      }),
    })
    told.email = true
  }
  return told
}

// What the routes call once a task has been given and saved. Telling someone is
// never allowed to fail the change that caused it.
export const announceTask = (itemId: string, assignerPersonId: string | null) => {
  try {
    return notifyTaskAssigned(db, itemId, assignerPersonId)
  }
  catch (error) {
    console.error('Could not announce a task:', error)
    return { message: false, email: false, notice: null } satisfies TaskNotice
  }
}

// Leaders choose how tasks in their ministry are announced.
export const setMinistryTaskNotify = (tx: Tx, viewer: NotifyViewer, ministryId: string, taskNotify: TaskNotify) => {
  if (!tx.select({ id: ministries.id }).from(ministries).where(eq(ministries.id, ministryId)).get() || !viewer.serves.has(ministryId)) throw notFound()
  if (!canManageChannels(viewer, ministryId)) throw forbidden()
  tx.update(ministries).set({ taskNotify }).where(eq(ministries.id, ministryId)).run()
}
