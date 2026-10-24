// Notifications: what a channel, a message and a person's log look like, and the
// limits on what may be sent. The rules about who may do what are in
// server/lib/notifications.ts. See docs/specs/push-notifications.md.
import { z } from 'zod'

export const TASK_NOTIFY = ['email', 'message', 'both'] as const
export type TaskNotify = (typeof TASK_NOTIFY)[number]
export const taskNotifySchema = z.enum(TASK_NOTIFY)

export const TASK_NOTIFY_LABELS: Record<TaskNotify, string> = {
  email: 'By email',
  message: 'By a message in Notifications',
  both: 'Both: email and a message',
}

// Limits on what a leader writes. A notification can appear on a lock screen, so it is short.
export const TITLE_MAX = 60
export const BODY_MAX = 200

export const channelInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the channel').max(40),
  description: z.string().trim().max(120).default(''),
})
export type ChannelInput = z.infer<typeof channelInputSchema>

export const channelPatchSchema = channelInputSchema.partial().extend({ archived: z.boolean().optional() })
export type ChannelPatch = z.infer<typeof channelPatchSchema>

// A page on this site, and nowhere else: a path, never an address with a host.
const sitePath = z.string().trim().max(200)
  .regex(/^\/(?!\/)[A-Za-z0-9\-._~/%?=&#]*$/, 'Choose a page on this site')

export const sendInputSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(TITLE_MAX),
  body: z.string().trim().min(1, 'Enter a message').max(BODY_MAX),
  // An empty box means "use the usual page", the same as not choosing one.
  url: z.union([z.literal(''), sitePath]).nullish().transform(url => url || null),
})
export type SendInput = z.infer<typeof sendInputSchema>

export const readInputSchema = z.object({
  ids: z.array(z.string()).max(200).optional(),
  all: z.boolean().optional(),
}).refine(input => input.all || input.ids?.length, 'Say which to mark read')

export const taskNotifyInputSchema = z.object({ taskNotify: taskNotifySchema })

// Global settings, edited with Church details.
export const notificationSettingsSchema = z.object({
  maxPerDay: z.number().int().min(1, 'At least 1').max(50, 'At most 50'),
  keepDays: z.number().int().min(7, 'At least 7 days').max(365, 'At most 365 days'),
  // Zero turns the gap off.
  minGapSeconds: z.number().int().min(0, 'At least 0').max(3600, 'At most an hour'),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time'),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time'),
  // Accounts, by user id, who may send to the church-wide channels.
  senderUserIds: z.array(z.string()).max(100),
})
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>

export const NOTIFICATION_DEFAULTS = { maxPerDay: 5, keepDays: 90, minGapSeconds: 30, quietStart: '21:00', quietEnd: '07:00' } as const

// ---------------------------------------------------------------------------
// What the screens receive

export interface ChannelView {
  id: string
  // Empty for a church-wide channel.
  ministry: { slug: string, name: string } | null
  name: string
  description: string
  archived: boolean
  // For the person asking: do they follow it (they do until they mute it)?
  following: boolean
}

// Who a ministry's messages can reach, for its leaders. A person with no account
// cannot be told anything here.
export interface AudienceView {
  people: Array<{ id: string, name: string, isLeader: boolean, canReceive: boolean }>
  // Everyone on the roster who has an account, listed or not.
  reachable: number
  total: number
}

export interface ChannelsPayload {
  channels: ChannelView[]
  // Leaders: add and rename channels, and send.
  canManage: boolean
  taskNotify: TaskNotify
  audience: AudienceView | null
}

export interface NotificationView {
  id: string
  kind: 'channel' | 'task'
  title: string
  body: string
  url: string | null
  at: string
  read: boolean
  // "Nursery · General", or "Church announcements".
  from: string
}

export interface LogPayload {
  notifications: NotificationView[]
  unread: number
  // Days a notification is kept, so the screen can say so.
  keepDays: number
}

// A leader's sent list: how many it reached and how many have read it. Never who.
export interface SentView {
  id: string
  channelName: string
  title: string
  body: string
  at: string
  recipients: number
  read: number
}

export interface SentPayload {
  sent: SentView[]
  // Messages left today on each channel, so the form can say so.
  limit: number
  // The least time between two messages on a channel, in seconds.
  minGapSeconds: number
  usedToday: Record<string, number>
}

export interface NotificationSettingsView extends NotificationSettingsInput {
  // The accounts that could be chosen as senders: a member with an account, by name.
  candidates: Array<{ userId: string, name: string }>
}
