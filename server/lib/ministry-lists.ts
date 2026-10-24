// Ministry lists: who may see and do what, and every read and write.
// See docs/specs/ministry-lists.md.
//
// Two rules govern the file:
//
// 1. Nobody sees, counts, searches or edits what they cannot see. A leaders-only
//    list is filtered out of the query for anyone who is not a leader of that
//    ministry (or a pastor), and a list someone cannot see is a 404, never a 403,
//    so its existence is not confirmed either.
// 2. A list belongs to the ministry. Authority is read from the roster
//    (ministry_members.isLeader) on every call, so naming a new leader hands the
//    lists over with nothing to migrate.
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { createError } from 'h3'
import {
  ASSIGNED_AUDIENCE_ERROR,
  MASKED_NAME,
  type AssignedTaskView,
  type HistoryEntry,
  type ItemInput,
  type ItemPatch,
  type ListAudience,
  type ListInput,
  type ListItemView,
  type ListKind,
  type ListPatch,
  type MinistryListsPayload,
  type MinistryListView,
  type MyListsPayload,
  type PersonRef,
  type RosterOption,
  type RunStyle,
} from '../../shared/ministry-lists.ts'
import { ministries, ministryListCompletions, ministryListItems, ministryLists, ministryMembers, people } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'

type Reader = Tx | typeof db

// ---------------------------------------------------------------------------
// Who is looking

export interface ListViewer {
  personId: string | null
  // Ministries the person serves in, and the ones they lead. Leading implies
  // serving: both come from the same roster row. Empty for anyone who is not a
  // signed-in member.
  serves: ReadonlySet<string>
  leads: ReadonlySet<string>
  // Staff overview across every ministry (ministryList:view / viewLeadersOnly).
  // Read-only.
  staffView: boolean
  staffViewLeadersOnly: boolean
  // Lists whose audience is "leaders and assigned people" on which this person
  // currently holds a task. Read fresh with every request, so losing the last
  // task takes the list away at once.
  assignedLists: ReadonlySet<string>
}

export const loadListViewer = (
  userId: string,
  access: { isMember: boolean, staffView: boolean, staffViewLeadersOnly: boolean },
  reader: Reader = db,
): ListViewer => {
  const person = reader.select({ id: people.id }).from(people).where(eq(people.userId, userId)).get()
  const rows = person && access.isMember
    ? reader.select({ ministryId: ministryMembers.ministryId, isLeader: ministryMembers.isLeader })
        .from(ministryMembers).where(eq(ministryMembers.personId, person.id)).all()
    : []
  const held = person && access.isMember
    ? reader.selectDistinct({ listId: ministryListItems.listId }).from(ministryListItems)
        .innerJoin(ministryLists, eq(ministryLists.id, ministryListItems.listId))
        .where(and(eq(ministryListItems.assigneeId, person.id), eq(ministryLists.audience, 'assigned'))).all()
    : []
  return {
    personId: person?.id ?? null,
    assignedLists: new Set(held.map(row => row.listId)),
    serves: new Set(rows.map(row => row.ministryId)),
    leads: new Set(rows.filter(row => row.isLeader).map(row => row.ministryId)),
    // Seeing leaders-only lists implies seeing the rest.
    staffView: access.staffView || access.staffViewLeadersOnly,
    staffViewLeadersOnly: access.staffViewLeadersOnly,
  }
}

// ---------------------------------------------------------------------------
// The rules. Exported so the tests can assert every cell of the matrix.

interface ListRef { id?: string, ministryId: string, audience: ListAudience, kind: string, assigneesSeeAll?: boolean, endedAt?: Date | null, routineId?: string | null }

export const canSeeList = (viewer: ListViewer, list: ListRef) => {
  if (list.audience === 'leaders') return viewer.leads.has(list.ministryId) || viewer.staffViewLeadersOnly
  if (list.audience === 'assigned') {
    // Leaders and pastors, and anyone serving here who holds a task on this list.
    return viewer.leads.has(list.ministryId) || viewer.staffViewLeadersOnly
      || (viewer.serves.has(list.ministryId) && list.id !== undefined && viewer.assignedLists.has(list.id))
  }
  return viewer.serves.has(list.ministryId) || viewer.staffView
}

// On a "leaders and assigned people" list an assignee sees only their own tasks,
// unless the leader chose to show them everyone's. Leaders and pastors see all of
// them; so does everyone on any other audience.
export const seesAllItems = (viewer: ListViewer, list: ListRef) =>
  list.audience !== 'assigned' || Boolean(list.assigneesSeeAll) || canManageList(viewer, list) || viewer.staffViewLeadersOnly

// Leaders of the ministry, and only them. Staff read; they never change.
export const canManageList = (viewer: ListViewer, list: Pick<ListRef, 'ministryId'>) =>
  viewer.leads.has(list.ministryId)

// Leaders add anything. Members add only to a plain checklist. A finished run is
// a record, so nobody adds to it.
export const canAddItem = (viewer: ListViewer, list: ListRef) => {
  if (list.endedAt) return false
  return canManageList(viewer, list)
    || (list.kind === 'list' && viewer.serves.has(list.ministryId) && canSeeList(viewer, list))
}

export const canCheckItem = (viewer: ListViewer, list: ListRef, item: { assigneeId: string | null }) => {
  // A routine's steps are a template, not something to tick; the checks happen in
  // a run. A finished run is a record.
  if (list.kind === 'routine' || list.endedAt) return false
  if (!canSeeList(viewer, list) || !viewer.serves.has(list.ministryId)) return false
  if (canManageList(viewer, list)) return true
  // A checklist is worked by whoever is there; a task by the person it was given to.
  return list.kind === 'list' || (item.assigneeId !== null && item.assigneeId === viewer.personId)
}

// Anyone serving in the ministry may start a run of one of its routines, and
// finish the one that is open. Leaders still own the template. Staff read only.
export const canStartRun = (viewer: ListViewer, list: ListRef) =>
  list.kind === 'routine' && viewer.serves.has(list.ministryId) && canSeeList(viewer, list)

export const canEndRun = (viewer: ListViewer, list: ListRef) =>
  Boolean(list.routineId) && !list.endedAt && viewer.serves.has(list.ministryId) && canSeeList(viewer, list)

// Leaders, and the staff who may read that list.
export const canSeeHistory = (viewer: ListViewer, list: ListRef) =>
  canManageList(viewer, list) || (list.audience === 'ministry' ? viewer.staffView : viewer.staffViewLeadersOnly)

// ---------------------------------------------------------------------------
// Names

const personName = (person: { firstName: string, lastName: string }) => `${person.firstName} ${person.lastName}`

// Church time, for "overdue". Dates in this feature are plain calendar dates.
export const churchToday = (now = new Date(), zone = process.env.CHURCH_TIME_ZONE || 'America/Detroit') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

// A name as this viewer may see it. Minors are never named to other members, and
// someone who has asked not to be shown on a ministry's roster is not named by
// that ministry's lists either. Everyone sees their own name.
const makeNamer = (reader: Reader, viewer: ListViewer, personIds: Array<string | null>) => {
  const ids = [...new Set(personIds.filter((id): id is string => id !== null))]
  const rows = ids.length
    ? reader.select({
        id: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
        isMinor: people.isMinor,
        ministryId: ministryMembers.ministryId,
        showToMembers: ministryMembers.showToMembers,
      }).from(people).leftJoin(ministryMembers, eq(ministryMembers.personId, people.id)).where(inArray(people.id, ids)).all()
    : []
  const known = new Map<string, { name: string, isMinor: boolean, hiddenIn: Set<string> }>()
  for (const row of rows) {
    const entry = known.get(row.id) ?? { name: personName(row), isMinor: row.isMinor, hiddenIn: new Set<string>() }
    if (row.ministryId && row.showToMembers === false) entry.hiddenIn.add(row.ministryId)
    known.set(row.id, entry)
  }
  return (personId: string | null, ministryId: string): PersonRef | null => {
    const person = personId ? known.get(personId) : undefined
    if (!personId || !person) return null
    if (personId === viewer.personId) return { id: personId, name: person.name }
    if (person.isMinor || person.hiddenIn.has(ministryId)) return { id: null, name: MASKED_NAME }
    return { id: personId, name: person.name }
  }
}

// ---------------------------------------------------------------------------
// Reading

type ListRow = typeof ministryLists.$inferSelect
type ItemRow = typeof ministryListItems.$inferSelect
interface ListWithMinistry { list: ListRow, ministry: { id: string, slug: string, name: string } }

const iso = (date: Date | null) => date ? date.toISOString() : null

const buildViews = (reader: Reader, viewer: ListViewer, rows: ListWithMinistry[]): MinistryListView[] => {
  if (!rows.length) return []
  const items = reader.select().from(ministryListItems)
    .where(inArray(ministryListItems.listId, rows.map(row => row.list.id)))
    .orderBy(asc(ministryListItems.sortOrder), asc(ministryListItems.createdAt)).all()
  const name = makeNamer(reader, viewer, [
    ...items.flatMap(item => [item.assigneeId, item.assignedBy, item.doneBy]),
    ...rows.map(row => row.list.createdBy),
  ])
  const today = churchToday()

  return rows.map(({ list, ministry }) => {
    const manage = canManageList(viewer, list)
    const itemView = (item: ItemRow): ListItemView => ({
      id: item.id,
      title: item.title,
      assignee: name(item.assigneeId, list.ministryId),
      assignedBy: name(item.assignedBy, list.ministryId),
      assignedAt: iso(item.assignedAt),
      dueDate: item.dueDate,
      dueTime: item.dueTime,
      overdue: !item.doneAt && item.dueDate !== null && item.dueDate < today,
      done: item.doneAt ? { at: item.doneAt.toISOString(), by: name(item.doneBy, list.ministryId) } : null,
      // Only the people who can act on it are told a task lost its assignee.
      unassigned: manage && item.unassignedAt ? { at: item.unassignedAt.toISOString(), note: item.unassignedNote ?? '' } : null,
      mine: item.assigneeId !== null && item.assigneeId === viewer.personId,
      canCheck: canCheckItem(viewer, list, item),
    })
    return {
      id: list.id,
      ministry,
      name: list.name,
      kind: list.kind as ListKind,
      audience: list.audience,
      ordered: list.ordered,
      assigneesSeeAll: list.assigneesSeeAll,
      taskNotify: list.taskNotify,
      // On a "leaders and assigned people" list, an assignee gets only their own tasks.
      items: items
        .filter(item => item.listId === list.id && (seesAllItems(viewer, list) || (item.assigneeId !== null && item.assigneeId === viewer.personId)))
        .map(itemView),
      canManage: manage,
      canAdd: canAddItem(viewer, list),
      canSeeHistory: canSeeHistory(viewer, list),
      routineId: list.routineId,
      run: list.routineId
        ? { startedAt: list.createdAt.toISOString(), startedBy: name(list.createdBy, list.ministryId), endedAt: iso(list.endedAt), endedHow: list.endedHow }
        : null,
      canStartRun: canStartRun(viewer, list),
      canEndRun: canEndRun(viewer, list),
    }
  })
}

const selectLists = (reader: Reader) =>
  reader.select({ list: ministryLists, ministry: { id: ministries.id, slug: ministries.slug, name: ministries.name } })
    .from(ministryLists).innerJoin(ministries, eq(ministries.id, ministryLists.ministryId))

// What this viewer may see of one ministry's lists. The audience is part of the
// query, so a leaders-only list is never even loaded for someone who cannot see
// it; the check afterwards is a second lock, not the first.
export const loadMinistryLists = (viewer: ListViewer, ministryId: string, reader: Reader = db): MinistryListView[] => {
  const sees = {
    ministry: viewer.serves.has(ministryId) || viewer.staffView,
    leaders: viewer.leads.has(ministryId) || viewer.staffViewLeadersOnly,
    // Leaders see every such list; a member only the ones they hold a task on
    // (narrowed to those lists below).
    assigned: viewer.leads.has(ministryId) || viewer.staffViewLeadersOnly || (viewer.serves.has(ministryId) && viewer.assignedLists.size > 0),
  }
  const allowed: ListAudience[] = [
    ...(sees.ministry ? ['ministry' as const] : []),
    ...(sees.leaders ? ['leaders' as const] : []),
    ...(sees.assigned ? ['assigned' as const] : []),
  ]
  if (!allowed.length) return []
  const audience = allowed.length === 3 ? undefined : inArray(ministryLists.audience, allowed)

  // Finished runs are a record: leaders and the staff who may read the list see
  // them, and nobody else even has them loaded.
  const finished = viewer.leads.has(ministryId) || viewer.staffView ? undefined : isNull(ministryLists.endedAt)
  const rows = selectLists(reader)
    .where(and(eq(ministryLists.ministryId, ministryId), audience, finished))
    .orderBy(asc(ministryLists.sortOrder), asc(ministryLists.createdAt)).all()
    .filter(row => canSeeList(viewer, row.list) && (!row.list.endedAt || canSeeHistory(viewer, row.list)))
  return buildViews(reader, viewer, rows)
}

// Who a leader may give a task to: adults on the roster who have not asked to be
// left off it. The same people the ministry page lists.
export const loadAssignable = (ministryId: string, reader: Reader = db): RosterOption[] =>
  reader.select({ id: people.id, firstName: people.firstName, lastName: people.lastName, isLeader: ministryMembers.isLeader, userId: people.userId })
    .from(ministryMembers).innerJoin(people, eq(people.id, ministryMembers.personId))
    .where(and(
      eq(ministryMembers.ministryId, ministryId),
      eq(ministryMembers.showToMembers, true),
      eq(people.kind, 'member'),
      eq(people.isMinor, false),
    ))
    .orderBy(asc(people.lastName), asc(people.firstName)).all()
    .map(row => ({ id: row.id, name: personName(row), isLeader: row.isLeader, canNotify: row.userId !== null }))

export const loadMinistryListsPayload = (viewer: ListViewer, ministryId: string, reader: Reader = db): MinistryListsPayload => {
  const canManage = viewer.leads.has(ministryId)
  return {
    lists: loadMinistryLists(viewer, ministryId, reader),
    canManage,
    people: canManage ? loadAssignable(ministryId, reader) : [],
  }
}

// One person's page: everything assigned to them, then each ministry they serve
// in. Only what they would see on those ministries' own pages as a member or
// leader; the staff overview does not leak onto it.
export const loadMyLists = (viewer: ListViewer, reader: Reader = db): MyListsPayload => {
  if (!viewer.personId || !viewer.serves.size) return { assigned: [], ministries: [] }
  const asMember: ListViewer = { ...viewer, staffView: false, staffViewLeadersOnly: false }
  const served = reader.select({ id: ministries.id, slug: ministries.slug, name: ministries.name }).from(ministries)
    .where(inArray(ministries.id, [...viewer.serves])).orderBy(asc(ministries.sortOrder), asc(ministries.name)).all()

  // The personal page is work in progress: a finished run is a record and stays
  // on the ministry's own page.
  const perMinistry = served.map(ministry => ({
    slug: ministry.slug,
    name: ministry.name,
    lists: loadMinistryLists(asMember, ministry.id, reader).filter(list => !list.run?.endedAt),
  }))

  const assigned: AssignedTaskView[] = perMinistry.flatMap(ministry => ministry.lists.flatMap(list =>
    list.kind === 'tasks' && !list.run?.endedAt
      ? list.items.filter(item => item.mine && !item.done).map(item => ({
          item,
          list: { id: list.id, name: list.name },
          ministry: { slug: ministry.slug, name: ministry.name },
        }))
      : []))
  // Soonest first (overdue lands first by being earliest); undated last.
  assigned.sort((a, b) => (a.item.dueDate ?? '9999').localeCompare(b.item.dueDate ?? '9999') || a.item.title.localeCompare(b.item.title))

  return { assigned, ministries: perMinistry.filter(ministry => ministry.lists.length) }
}

// ---------------------------------------------------------------------------
// Looking things up. Anything the viewer cannot see is a 404.

const notFound = () => createError({ statusCode: 404, statusMessage: 'List not found' })
const forbidden = () => createError({ statusCode: 403, statusMessage: 'Not allowed' })

const visibleList = (reader: Reader, viewer: ListViewer, listId: string) => {
  const list = reader.select().from(ministryLists).where(eq(ministryLists.id, listId)).get()
  if (!list || !canSeeList(viewer, list)) throw notFound()
  return list
}

const managedList = (reader: Reader, viewer: ListViewer, listId: string) => {
  const list = visibleList(reader, viewer, listId)
  if (!canManageList(viewer, list)) throw forbidden()
  return list
}

const finished = () => createError({ statusCode: 409, statusMessage: 'This run is finished, so it can no longer be changed' })

// A leader changing a list that is still live. A finished run is a record.
const openList = (reader: Reader, viewer: ListViewer, listId: string) => {
  const list = managedList(reader, viewer, listId)
  if (list.endedAt) throw finished()
  return list
}

const findItem = (reader: Reader, listId: string, itemId: string) => {
  const item = reader.select().from(ministryListItems)
    .where(and(eq(ministryListItems.id, itemId), eq(ministryListItems.listId, listId))).get()
  if (!item) throw createError({ statusCode: 404, statusMessage: 'Item not found' })
  return item
}

const nextSortOrder = (reader: Reader, table: 'lists' | 'items', parentId: string) => {
  const max = table === 'lists'
    ? reader.select({ max: sql<number | null>`max(${ministryLists.sortOrder})` }).from(ministryLists).where(eq(ministryLists.ministryId, parentId)).get()?.max
    : reader.select({ max: sql<number | null>`max(${ministryListItems.sortOrder})` }).from(ministryListItems).where(eq(ministryListItems.listId, parentId)).get()?.max
  return (max ?? -1) + 1
}

// A task goes to someone on the roster that the roster shows (an adult who has
// not asked to be left off it). On a leaders-only list, to a leader: anyone else
// would hold a task on a list they cannot see.
const assertAssignable = (reader: Reader, list: Pick<ListRow, 'ministryId' | 'audience'>, personId: string) => {
  const row = reader.select({ isLeader: ministryMembers.isLeader, kind: people.kind, isMinor: people.isMinor, shown: ministryMembers.showToMembers })
    .from(ministryMembers).innerJoin(people, eq(people.id, ministryMembers.personId))
    .where(and(eq(ministryMembers.ministryId, list.ministryId), eq(ministryMembers.personId, personId))).get()
  if (!row || row.kind !== 'member' || row.isMinor || !row.shown) {
    throw createError({ statusCode: 400, statusMessage: 'That person is not on this ministry’s list of people' })
  }
  if (list.audience === 'leaders' && !row.isLeader) {
    throw createError({ statusCode: 400, statusMessage: 'Only a leader can be given a task on a leaders-only list' })
  }
}

// ---------------------------------------------------------------------------
// Lists

export const createList = (tx: Tx, viewer: ListViewer, ministryId: string, input: ListInput) => {
  const ministry = tx.select({ id: ministries.id }).from(ministries).where(eq(ministries.id, ministryId)).get()
  if (!ministry) throw createError({ statusCode: 404, statusMessage: 'Ministry not found' })
  if (!canManageList(viewer, { ministryId })) throw forbidden()
  if (input.audience === 'assigned' && input.kind !== 'tasks') throw createError({ statusCode: 400, statusMessage: ASSIGNED_AUDIENCE_ERROR })
  return tx.insert(ministryLists).values({
    ministryId,
    name: input.name,
    kind: input.kind,
    audience: input.audience,
    ordered: input.ordered,
    assigneesSeeAll: input.audience === 'assigned' && input.assigneesSeeAll,
    // Only tasks (and a routine's runs of tasks) are announced.
    taskNotify: input.kind === 'list' ? null : input.taskNotify,
    sortOrder: nextSortOrder(tx, 'lists', ministryId),
    createdBy: viewer.personId,
  }).returning({ id: ministryLists.id }).get().id
}

// Making a list leaders-only while members hold open tasks on it would leave
// them holding work on a list they can no longer see. Say who, and stop.
const assertNoStrandedTasks = (tx: Tx, list: Pick<ListRow, 'id' | 'ministryId' | 'name'>, label = '') => {
  const stranded = tx.select({ title: ministryListItems.title })
    .from(ministryListItems)
    .leftJoin(ministryMembers, and(eq(ministryMembers.ministryId, list.ministryId), eq(ministryMembers.personId, ministryListItems.assigneeId)))
    .where(and(
      eq(ministryListItems.listId, list.id),
      isNotNull(ministryListItems.assigneeId),
      isNull(ministryListItems.doneAt),
      sql`coalesce(${ministryMembers.isLeader}, 0) = 0`,
    )).all()
  if (!stranded.length) return
  const shown = stranded.slice(0, 3).map(row => `“${row.title}”`).join(', ')
  throw createError({
    statusCode: 409,
    statusMessage: `${stranded.length} open task${stranded.length === 1 ? ' is' : 's are'}${label} assigned to people who are not leaders (${shown}${stranded.length > 3 ? ', …' : ''}). Reassign or unassign them first.`,
  })
}

// Returns the fields that changed.
export const updateList = (tx: Tx, viewer: ListViewer, listId: string, patch: ListPatch) => {
  const list = openList(tx, viewer, listId)
  const audienceChanges = patch.audience !== undefined && patch.audience !== list.audience

  if (patch.audience === 'assigned' && list.kind !== 'tasks') throw createError({ statusCode: 400, statusMessage: ASSIGNED_AUDIENCE_ERROR })

  // A run is generated from its routine and keeps its routine's audience.
  if (list.routineId && audienceChanges) {
    throw createError({ statusCode: 400, statusMessage: 'A run is seen by the same people as its routine. Change the routine instead.' })
  }

  const runs = list.kind === 'routine'
    ? tx.select().from(ministryLists).where(eq(ministryLists.routineId, listId)).all()
    : []
  if (patch.audience === 'leaders' && audienceChanges) {
    assertNoStrandedTasks(tx, list)
    for (const run of runs.filter(row => !row.endedAt)) assertNoStrandedTasks(tx, run, ` in the open run “${run.name}”,`)
  }

  // The "see everyone's tasks" choice only means something on an `assigned` list,
  // so moving to another audience puts it back.
  const finalAudience = patch.audience ?? list.audience
  const audienceFixed: ListPatch = finalAudience === 'assigned' ? patch : { ...patch, assigneesSeeAll: false }
  // A plain checklist has no tasks to announce.
  const { taskNotify: _unused, ...withoutNotify } = audienceFixed
  const wanted: ListPatch = list.kind === 'list' ? withoutNotify : audienceFixed
  const fields = (Object.keys(wanted) as Array<keyof ListPatch>).filter(field => wanted[field] !== list[field])
  if (fields.length) tx.update(ministryLists).set(Object.fromEntries(fields.map(field => [field, wanted[field]]))).where(eq(ministryLists.id, listId)).run()
  // Every run, finished ones too, follows: a past run of a leaders-only routine
  // must not turn up for people who cannot see the routine.
  if (audienceChanges && runs.length) tx.update(ministryLists).set({ audience: patch.audience! }).where(eq(ministryLists.routineId, listId)).run()
  return fields
}

export const deleteList = (tx: Tx, viewer: ListViewer, listId: string) => {
  const list = managedList(tx, viewer, listId)
  tx.delete(ministryLists).where(eq(ministryLists.id, listId)).run()
  return list
}

// ---------------------------------------------------------------------------
// Items

const assertNoTaskFields = (input: ItemPatch) => {
  if (input.assigneeId || input.dueDate || input.dueTime) {
    throw createError({ statusCode: 400, statusMessage: 'Only a list of tasks has an assignee or a due date' })
  }
}

// Returns whether a person was assigned, for the audit trail.
export const addItem = (tx: Tx, viewer: ListViewer, listId: string, input: ItemInput) => {
  const list = visibleList(tx, viewer, listId)
  if (list.endedAt) throw finished()
  if (!canAddItem(viewer, list)) throw forbidden()
  if (input.dueTime && !input.dueDate) throw createError({ statusCode: 400, statusMessage: 'A time needs a date' })

  if (list.kind === 'tasks') {
    if (input.assigneeId) assertAssignable(tx, list, input.assigneeId)
  }
  else assertNoTaskFields(input)

  const assigneeId = list.kind === 'tasks' ? input.assigneeId ?? null : null
  const id = tx.insert(ministryListItems).values({
    listId,
    title: input.title,
    sortOrder: nextSortOrder(tx, 'items', listId),
    assigneeId,
    assignedBy: assigneeId ? viewer.personId : null,
    assignedAt: assigneeId ? new Date() : null,
    dueDate: list.kind === 'tasks' ? input.dueDate ?? null : null,
    dueTime: list.kind === 'tasks' ? input.dueTime ?? null : null,
  }).returning({ id: ministryListItems.id }).get().id
  return { id, assigned: assigneeId !== null }
}

export const updateItem = (tx: Tx, viewer: ListViewer, listId: string, itemId: string, patch: ItemPatch) => {
  const list = openList(tx, viewer, listId)
  const item = findItem(tx, listId, itemId)
  if (list.kind !== 'tasks') assertNoTaskFields(patch)

  const changes: Partial<typeof ministryListItems.$inferInsert> = {}
  if (patch.title !== undefined) changes.title = patch.title
  if (patch.dueDate !== undefined) changes.dueDate = patch.dueDate
  if (patch.dueTime !== undefined) changes.dueTime = patch.dueTime
  if ((changes.dueTime ?? item.dueTime) && !(changes.dueDate !== undefined ? changes.dueDate : item.dueDate)) {
    throw createError({ statusCode: 400, statusMessage: 'A time needs a date' })
  }

  let assigned = false
  if (patch.assigneeId !== undefined && patch.assigneeId !== item.assigneeId) {
    if (patch.assigneeId === null) {
      Object.assign(changes, { assigneeId: null, assignedBy: null, assignedAt: null })
    }
    else {
      assertAssignable(tx, list, patch.assigneeId)
      // Assigned again: the "lost its assignee" notice has done its job.
      Object.assign(changes, { assigneeId: patch.assigneeId, assignedBy: viewer.personId, assignedAt: new Date(), unassignedAt: null, unassignedNote: null })
      assigned = true
    }
  }
  if (Object.keys(changes).length) tx.update(ministryListItems).set(changes).where(eq(ministryListItems.id, itemId)).run()
  return { assigned }
}

export const deleteItem = (tx: Tx, viewer: ListViewer, listId: string, itemId: string) => {
  openList(tx, viewer, listId)
  findItem(tx, listId, itemId)
  tx.delete(ministryListItems).where(eq(ministryListItems.id, itemId)).run()
}

// The leaders have seen it. The task keeps whatever else it was.
export const dismissUnassignedNotice = (tx: Tx, viewer: ListViewer, listId: string, itemId: string) => {
  openList(tx, viewer, listId)
  findItem(tx, listId, itemId)
  tx.update(ministryListItems).set({ unassignedAt: null, unassignedNote: null }).where(eq(ministryListItems.id, itemId)).run()
}

export const reorderItems = (tx: Tx, viewer: ListViewer, listId: string, ids: string[]) => {
  openList(tx, viewer, listId)
  const current = tx.select({ id: ministryListItems.id }).from(ministryListItems).where(eq(ministryListItems.listId, listId)).all().map(row => row.id)
  if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some(id => !current.includes(id))) {
    throw createError({ statusCode: 400, statusMessage: 'The order must list every item exactly once' })
  }
  ids.forEach((id, index) => tx.update(ministryListItems).set({ sortOrder: index }).where(eq(ministryListItems.id, id)).run())
}

// Checking and unchecking. Returns whether anything changed. Each check is also
// written to the history, with the title copied in.
export const setItemChecked = (tx: Tx, viewer: ListViewer, listId: string, itemId: string, done: boolean) => {
  const list = visibleList(tx, viewer, listId)
  const item = findItem(tx, listId, itemId)
  // On a "leaders and assigned people" list, other people's tasks are not the
  // viewer's to know about: 404, not 403.
  if (!seesAllItems(viewer, list) && item.assigneeId !== viewer.personId) throw createError({ statusCode: 404, statusMessage: 'Item not found' })
  if (list.kind === 'routine') throw createError({ statusCode: 400, statusMessage: 'A routine is a template. Start a run to tick its steps off.' })
  if (list.endedAt) throw finished()
  if (!viewer.personId || !canCheckItem(viewer, list, item)) throw forbidden()
  if (Boolean(item.doneAt) === done) return false

  if (done) {
    const person = tx.select({ firstName: people.firstName, lastName: people.lastName }).from(people).where(eq(people.id, viewer.personId)).get()
    tx.update(ministryListItems).set({ doneAt: new Date(), doneBy: viewer.personId }).where(eq(ministryListItems.id, itemId)).run()
    tx.insert(ministryListCompletions).values({
      listId,
      itemId,
      itemTitle: item.title,
      doneBy: viewer.personId,
      doneByName: person ? personName(person) : MASKED_NAME,
    }).run()
  }
  else {
    tx.update(ministryListItems).set({ doneAt: null, doneBy: null }).where(eq(ministryListItems.id, itemId)).run()
    tx.update(ministryListCompletions).set({ undoneAt: new Date() })
      .where(and(eq(ministryListCompletions.itemId, itemId), isNull(ministryListCompletions.undoneAt))).run()
  }
  return true
}

// ---------------------------------------------------------------------------
// History

export const loadHistory = (viewer: ListViewer, listId: string, reader: Reader = db): HistoryEntry[] => {
  const list = visibleList(reader, viewer, listId)
  if (!canSeeHistory(viewer, list)) throw forbidden()
  const rows = reader.select().from(ministryListCompletions).where(eq(ministryListCompletions.listId, listId))
    .orderBy(desc(ministryListCompletions.doneAt)).limit(200).all()
  const name = makeNamer(reader, viewer, rows.map(row => row.doneBy))
  return rows.map(row => ({
    id: row.id,
    itemTitle: row.itemTitle,
    // The copied-in name only if the person has since been deleted.
    by: row.doneBy ? name(row.doneBy, list.ministryId)?.name ?? MASKED_NAME : row.doneByName,
    at: row.doneAt.toISOString(),
    undoneAt: iso(row.undoneAt),
  }))
}

// ---------------------------------------------------------------------------
// Runs

// "Oct 25", in church time: the day a run was started, to tell runs apart.
const runLabel = () => new Date(`${churchToday()}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const endRun = (tx: Tx, run: ListRow) => {
  const steps = tx.select({ done: ministryListItems.doneAt }).from(ministryListItems).where(eq(ministryListItems.listId, run.id)).all()
  const complete = steps.length > 0 && steps.every(step => step.done)
  tx.update(ministryLists).set({ endedAt: new Date(), endedHow: complete ? 'complete' : 'ended' }).where(eq(ministryLists.id, run.id)).run()
  return complete
}

// Starts a run of a routine: a new ordinary list generated from its steps, as a
// checklist or as tasks to give out. Anyone serving in the ministry may start
// one. A routine has one open run at a time; starting another finishes the old
// one as unfinished, but only if the caller says so.
export const startRun = (tx: Tx, viewer: ListViewer, routineId: string, style: RunStyle, replaceOpen: boolean) => {
  const routine = visibleList(tx, viewer, routineId)
  if (routine.kind !== 'routine') throw createError({ statusCode: 400, statusMessage: 'Only a routine can be run' })
  if (!canStartRun(viewer, routine)) throw forbidden()

  const steps = tx.select().from(ministryListItems).where(eq(ministryListItems.listId, routineId))
    .orderBy(asc(ministryListItems.sortOrder), asc(ministryListItems.createdAt)).all()
  if (!steps.length) throw createError({ statusCode: 409, statusMessage: 'Add at least one step to the routine before starting a run' })

  const open = tx.select().from(ministryLists).where(and(eq(ministryLists.routineId, routineId), isNull(ministryLists.endedAt))).all()
  if (open.length && !replaceOpen) throw createError({ statusCode: 409, statusMessage: 'A run of this routine is already open' })
  for (const run of open) endRun(tx, run)

  const id = tx.insert(ministryLists).values({
    ministryId: routine.ministryId,
    name: `${routine.name} · ${runLabel()}`,
    kind: style,
    // The routine's audience, now and whenever it changes (see updateList).
    audience: routine.audience,
    ordered: routine.ordered,
    sortOrder: routine.sortOrder,
    createdBy: viewer.personId,
    routineId,
    // A run of tasks announces them as its routine says.
    taskNotify: style === 'tasks' ? routine.taskNotify : null,
  }).returning({ id: ministryLists.id }).get().id
  // The steps are copied, so editing the template later never changes a run.
  tx.insert(ministryListItems).values(steps.map((step, index) => ({ listId: id, title: step.title, sortOrder: index }))).run()
  return { id, replaced: open.length }
}

// Finishing records how far the run got: `complete` when every step was done,
// `ended` when steps were left. Either way it becomes a read-only record.
export const finishRun = (tx: Tx, viewer: ListViewer, runId: string) => {
  const run = visibleList(tx, viewer, runId)
  if (!run.routineId) throw createError({ statusCode: 400, statusMessage: 'Only a run of a routine can be finished' })
  if (run.endedAt) throw finished()
  if (!canEndRun(viewer, run)) throw forbidden()
  return { complete: endRun(tx, run) }
}

// ---------------------------------------------------------------------------
// When the roster changes under a task

// Open tasks whose assignee may no longer hold them: gone from the ministry, no
// longer an adult member, or no longer a leader of a leaders-only list.
// Called after any change to who serves or who leads, in the same transaction.
export const reconcileAssignments = (tx: Tx) => {
  const rows = tx.select({
    itemId: ministryListItems.id,
    firstName: people.firstName,
    lastName: people.lastName,
    isMinor: people.isMinor,
    kind: people.kind,
    audience: ministryLists.audience,
    onRoster: ministryMembers.personId,
    isLeader: ministryMembers.isLeader,
    shown: ministryMembers.showToMembers,
  })
    .from(ministryListItems)
    .innerJoin(ministryLists, eq(ministryLists.id, ministryListItems.listId))
    .innerJoin(people, eq(people.id, ministryListItems.assigneeId))
    .leftJoin(ministryMembers, and(eq(ministryMembers.ministryId, ministryLists.ministryId), eq(ministryMembers.personId, ministryListItems.assigneeId)))
    // A finished run is a record of what happened; there is nothing left to act on.
    .where(and(isNotNull(ministryListItems.assigneeId), isNull(ministryListItems.doneAt), isNull(ministryLists.endedAt))).all()

  let released = 0
  for (const row of rows) {
    const reason = !row.onRoster
      ? 'is no longer in this ministry'
      : row.isMinor || row.kind !== 'member'
        ? 'can no longer be given tasks'
        : row.audience === 'leaders' && !row.isLeader
          ? 'no longer leads this ministry'
          : null
    if (!reason) continue
    // The notice goes to leaders, who could not see a masked person's name.
    const who = row.isMinor || row.shown === false ? 'A member' : personName(row)
    release(tx, row.itemId, `${who} ${reason}`)
    released++
  }
  return released
}

// A person about to be deleted: their open tasks are released with a note,
// because the foreign key would otherwise clear them without a word.
export const releaseTasksOf = (tx: Tx, personId: string) => {
  const person = tx.select({ firstName: people.firstName, lastName: people.lastName, isMinor: people.isMinor }).from(people).where(eq(people.id, personId)).get()
  if (!person) return 0
  const open = tx.select({ id: ministryListItems.id }).from(ministryListItems)
    .where(and(eq(ministryListItems.assigneeId, personId), isNull(ministryListItems.doneAt))).all()
  const who = person.isMinor ? 'A member' : personName(person)
  for (const item of open) release(tx, item.id, `${who} was removed from the directory`)
  return open.length
}

const release = (tx: Tx, itemId: string, note: string) =>
  tx.update(ministryListItems).set({ assigneeId: null, assignedBy: null, assignedAt: null, unassignedAt: new Date(), unassignedNote: note })
    .where(eq(ministryListItems.id, itemId)).run()
