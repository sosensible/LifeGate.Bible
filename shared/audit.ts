// Plain-language names for audit log entries, and the shapes the viewer receives.
import { z } from 'zod'

export const ACTION_LABELS: Record<string, string> = {
  'auth.signIn': 'Signed in',
  'account.create': 'Created account',
  'account.roles': 'Changed roles',
  'account.block': 'Blocked account',
  'account.unblock': 'Unblocked account',
  'account.delete': 'Deleted account',
  'account.passwordLink': 'Sent password link',
  'account.signOutEverywhere': 'Signed account out everywhere',
  'account.link': 'Connected account to person',
  'account.unlink': 'Disconnected account from person',
  'person.create': 'Added person',
  'person.update': 'Edited person',
  'person.delete': 'Removed person',
  'privacy.update': 'Changed sharing',
  'profile.update': 'Updated own profile',
  'household.create': 'Added household',
  'household.update': 'Edited household',
  'household.delete': 'Removed household',
  'sermon.create': 'Added sermon',
  'sermon.update': 'Edited sermon',
  'sermon.publish': 'Published sermon',
  'sermon.unpublish': 'Unpublished sermon',
  'sermon.delete': 'Removed sermon',
  'series.create': 'Added series',
  'series.update': 'Edited series',
  'series.delete': 'Removed series',
}

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  user: 'Accounts',
  person: 'People',
  household: 'Households',
  sermon: 'Sermons',
  sermonSeries: 'Sermon series',
}

export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
  entityType: z.string().max(40).optional(),
  action: z.string().max(60).optional(),
  actorId: z.string().max(100).optional(),
  // Inclusive dates, YYYY-MM-DD, in the server's time zone.
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  // Hide sign-ins, which otherwise crowd out changes.
  hideSignIns: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
})

export interface AuditEntryView {
  id: string
  at: string
  action: string
  entityType: string
  entityId: string | null
  // A name for what was changed, or null if it no longer exists.
  entityLabel: string | null
  actor: { id: string, label: string } | null
  fields: string[]
  note: string | null
}
