// Ministry lists: validation, and the shapes the server sends. The rules about
// who may see and do what live in server/lib/ministry-lists.ts; see
// docs/specs/ministry-lists.md.
import { z } from 'zod'

// A routine is a template of steps. Starting a run generates an ordinary list
// from it, either a checklist (`list`) or tasks (`tasks`), so there are only two
// kinds of run.
export const LIST_KINDS = ['list', 'tasks', 'routine'] as const
export type ListKind = (typeof LIST_KINDS)[number]

export const RUN_STYLES = ['list', 'tasks'] as const
export type RunStyle = (typeof RUN_STYLES)[number]

// `assigned`: the ministry's leaders, and each person who holds a task on the
// list, who sees only their own tasks. Task lists only.
export const LIST_AUDIENCES = ['ministry', 'leaders', 'assigned'] as const
export type ListAudience = (typeof LIST_AUDIENCES)[number]

export const KIND_LABELS: Record<ListKind, string> = { list: 'Checklist', tasks: 'Tasks', routine: 'Routine' }
export const RUN_STYLE_LABELS: Record<RunStyle, string> = { list: 'Checklist', tasks: 'Tasks to give out' }
export const AUDIENCE_LABELS: Record<ListAudience, string> = { ministry: 'Everyone serving', leaders: 'Leaders only', assigned: 'Leaders and assignees' }
export const ASSIGNED_AUDIENCE_ERROR = 'Only a list of tasks can be shared with the people it is assigned to'

// What a viewer sees in place of someone who has asked not to be shown on a
// ministry's roster, or who is a minor.
export const MASKED_NAME = 'Someone'

const isoDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-25')
  .refine(value => new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), 'That is not a real date')
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30')

export const listInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  kind: z.enum(LIST_KINDS).default('list'),
  audience: z.enum(LIST_AUDIENCES).default('ministry'),
  ordered: z.boolean().default(false),
  assigneesSeeAll: z.boolean().default(false),
}).refine(list => list.audience !== 'assigned' || list.kind === 'tasks', { message: ASSIGNED_AUDIENCE_ERROR, path: ['audience'] })
export type ListInput = z.infer<typeof listInputSchema>

// Only what is sent changes. The kind cannot change: turning tasks into a plain
// checklist would quietly drop the assignments and due dates.
export const listPatchSchema = z.object({
  name: listInputSchema.shape.name,
  audience: z.enum(LIST_AUDIENCES),
  ordered: z.boolean(),
  assigneesSeeAll: z.boolean(),
}).partial().refine(patch => Object.keys(patch).length > 0, 'Nothing to change')
export type ListPatch = z.infer<typeof listPatchSchema>

// `undefined` leaves a field alone on an edit; `null` clears it.
export const itemInputSchema = z.object({
  title: z.string().trim().min(1, 'Enter what needs doing').max(120),
  assigneeId: z.string().min(1).nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  dueTime: clockTime.nullable().optional(),
})
export type ItemInput = z.infer<typeof itemInputSchema>

export const itemPatchSchema = itemInputSchema.partial()
  .refine(patch => Object.keys(patch).length > 0, 'Nothing to change')
export type ItemPatch = z.infer<typeof itemPatchSchema>

export const checkSchema = z.object({ done: z.boolean() })

// `replaceOpen` is how the person says yes to "a run is already open; finish it
// and start another". Without it the server refuses rather than closing a run
// somebody is still working.
export const startRunSchema = z.object({
  style: z.enum(RUN_STYLES),
  replaceOpen: z.boolean().default(false),
})
export const orderSchema = z.object({ ids: z.array(z.string().min(1)).min(1) })

// A person as a viewer may see them. `id` is null when the name is masked, so a
// masked person cannot be recognised from the id either.
export interface PersonRef {
  id: string | null
  name: string
}

export interface ListItemView {
  id: string
  title: string
  assignee: PersonRef | null
  assignedBy: PersonRef | null
  assignedAt: string | null
  dueDate: string | null
  dueTime: string | null
  // Open and past the due date, in church time.
  overdue: boolean
  done: { at: string, by: PersonRef | null } | null
  // Why a task has no one assigned any more. Sent to the ministry's leaders only.
  unassigned: { at: string, note: string } | null
  // Assigned to the person looking.
  mine: boolean
  canCheck: boolean
}

export interface MinistryListView {
  id: string
  ministry: { id: string, slug: string, name: string }
  name: string
  kind: ListKind
  audience: ListAudience
  ordered: boolean
  // On an `assigned` list: whether assignees also see other people's tasks.
  assigneesSeeAll: boolean
  items: ListItemView[]
  canManage: boolean
  canAdd: boolean
  canSeeHistory: boolean
  // Set on a run: the routine it was generated from, and where it stands.
  routineId: string | null
  run: {
    startedAt: string
    startedBy: PersonRef | null
    endedAt: string | null
    // `complete`: every step was done. `ended`: finished, or replaced by a newer
    // run, with steps left undone.
    endedHow: 'complete' | 'ended' | null
  } | null
  // On a routine: whether this viewer may start a run. On a run: whether they
  // may finish it.
  canStartRun: boolean
  canEndRun: boolean
}

// Who a leader may assign a task to.
export interface RosterOption {
  id: string
  name: string
  isLeader: boolean
}

export interface MinistryListsPayload {
  lists: MinistryListView[]
  canManage: boolean
  people: RosterOption[]
}

export interface AssignedTaskView {
  item: ListItemView
  list: { id: string, name: string }
  ministry: { slug: string, name: string }
}

export interface MyListsPayload {
  assigned: AssignedTaskView[]
  ministries: Array<{ slug: string, name: string, lists: MinistryListView[] }>
}

export interface HistoryEntry {
  id: string
  itemTitle: string
  by: string
  at: string
  // Set when the check was taken back.
  undoneAt: string | null
}
