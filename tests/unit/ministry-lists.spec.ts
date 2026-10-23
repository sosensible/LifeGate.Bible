// Ministry lists, against a throwaway SQLite database. The risk here is access:
// who sees a list, who changes it, and that nothing a person cannot see leaks
// through any other door. See docs/specs/ministry-lists.md.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-ministry-lists-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let lib: typeof import('../../server/lib/ministry-lists')
let ministriesLib: typeof import('../../server/lib/ministries')
let peopleLib: typeof import('../../server/lib/people')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/ministry-lists')
  ministriesLib = await import('../../server/lib/ministries')
  peopleLib = await import('../../server/lib/people')
  orm = await import('drizzle-orm')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let counter = 0
const unique = () => `${++counter}`

const newMinistry = (name = `Ministry ${unique()}`) =>
  db.transaction(tx => ministriesLib.createMinistry(tx, { name, description: 'A test ministry.' }))

const newPerson = (first: string, extra: Partial<typeof schema.people.$inferInsert> = {}) =>
  db.insert(schema.people).values({ firstName: first, lastName: `Test${unique()}`, ...extra }).returning().get()

const join_ = (ministryId: string, personId: string, options: { leader?: boolean, shown?: boolean } = {}) =>
  db.insert(schema.ministryMembers).values({ ministryId, personId, isLeader: options.leader ?? false, showToMembers: options.shown ?? true }).run()

// A viewer built by hand, so each rule can be exercised on its own.
const viewerOf = (
  personId: string | null,
  options: { serves?: string[], leads?: string[], view?: boolean, leadersOnly?: boolean, assigned?: string[] } = {},
): import('../../server/lib/ministry-lists').ListViewer => ({
  personId,
  assignedLists: new Set(options.assigned ?? []),
  serves: new Set([...(options.serves ?? []), ...(options.leads ?? [])]),
  leads: new Set(options.leads ?? []),
  staffView: Boolean(options.view || options.leadersOnly),
  staffViewLeadersOnly: Boolean(options.leadersOnly),
})

const statusOf = (fn: () => unknown) => {
  try {
    fn()
  }
  catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
  return undefined
}

const tx = <T>(fn: (t: Parameters<Parameters<typeof db.transaction>[0]>[0]) => T) => db.transaction(fn)

// One ministry with a leader, a member, and lists of each audience.
const scenario = () => {
  const ministryId = newMinistry()
  const leader = newPerson('Lead')
  const member = newPerson('Member')
  const other = newPerson('Other')
  join_(ministryId, leader.id, { leader: true })
  join_(ministryId, member.id)
  const otherMinistry = newMinistry()
  join_(otherMinistry, other.id)

  const asLeader = viewerOf(leader.id, { leads: [ministryId] })
  const asMember = viewerOf(member.id, { serves: [ministryId] })
  const asOutsider = viewerOf(other.id, { serves: [otherMinistry] })
  const asSecretary = viewerOf(null, { view: true })
  const asPastor = viewerOf(null, { leadersOnly: true })
  const asNobody = viewerOf(null)

  const open = tx(t => lib.createList(t, asLeader, ministryId, { name: 'Open', kind: 'list', audience: 'ministry', ordered: false }))
  const hidden = tx(t => lib.createList(t, asLeader, ministryId, { name: 'Leaders', kind: 'list', audience: 'leaders', ordered: false }))
  const tasks = tx(t => lib.createList(t, asLeader, ministryId, { name: 'Tasks', kind: 'tasks', audience: 'ministry', ordered: false }))
  return { ministryId, leader, member, other, asLeader, asMember, asOutsider, asSecretary, asPastor, asNobody, open, hidden, tasks }
}

describe('who may see and do what', () => {
  let s!: ReturnType<typeof scenario>
  beforeAll(() => { s = scenario() })
  const ref = (audience: 'ministry' | 'leaders', kind = 'list') => ({ ministryId: s.ministryId, audience, kind })

  // actor × audience -> see, manage, add (plain list), history
  type Cells = Array<['ministry' | 'leaders', boolean, boolean, boolean, boolean]>
  const rows: Array<[string, 'asLeader' | 'asMember' | 'asOutsider' | 'asSecretary' | 'asPastor' | 'asNobody', Cells]> = [
    ['leader', 'asLeader', [['ministry', true, true, true, true], ['leaders', true, true, true, true]]],
    ['member', 'asMember', [['ministry', true, false, true, false], ['leaders', false, false, false, false]]],
    ['member of another ministry', 'asOutsider', [['ministry', false, false, false, false], ['leaders', false, false, false, false]]],
    ['church secretary (staff view)', 'asSecretary', [['ministry', true, false, false, true], ['leaders', false, false, false, false]]],
    ['pastor (staff view + leaders-only)', 'asPastor', [['ministry', true, false, false, true], ['leaders', true, false, false, true]]],
    ['signed in, serves nowhere (an admin, say)', 'asNobody', [['ministry', false, false, false, false], ['leaders', false, false, false, false]]],
  ]

  for (const [who, key, cells] of rows) {
    for (const [audience, see, manage, add, history] of cells) {
      it(`${who} on a ${audience} list: see ${see}, manage ${manage}, add ${add}, history ${history}`, () => {
        const viewer = s[key]
        expect(lib.canSeeList(viewer, ref(audience))).toBe(see)
        expect(lib.canManageList(viewer, ref(audience))).toBe(manage)
        expect(lib.canAddItem(viewer, ref(audience))).toBe(add)
        expect(lib.canSeeHistory(viewer, ref(audience))).toBe(history)
      })
    }
  }

  it('lets a member add to a plain checklist but never to a task list', () => {
    expect(lib.canAddItem(s.asMember, ref('ministry', 'list'))).toBe(true)
    expect(lib.canAddItem(s.asMember, ref('ministry', 'tasks'))).toBe(false)
    expect(lib.canAddItem(s.asLeader, ref('ministry', 'tasks'))).toBe(true)
  })

  it('lets staff read and nothing else', () => {
    for (const staff of [s.asSecretary, s.asPastor]) {
      expect(lib.canManageList(staff, ref('ministry'))).toBe(false)
      expect(lib.canCheckItem(staff, ref('ministry'), { assigneeId: null })).toBe(false)
    }
  })

  it('lets a pastor who also serves in the ministry work its lists as a member', () => {
    const both = viewerOf(s.member.id, { serves: [s.ministryId], leadersOnly: true })
    expect(lib.canCheckItem(both, ref('ministry'), { assigneeId: null })).toBe(true)
  })
})

describe('what each person is shown', () => {
  let s!: ReturnType<typeof scenario>
  beforeAll(() => { s = scenario() })
  const names = (viewer: import('../../server/lib/ministry-lists').ListViewer) =>
    lib.loadMinistryLists(viewer, s.ministryId).map(list => list.name).sort()

  it('shows leaders every list, members and the secretary the ministry lists, and the pastor all of them', () => {
    expect(names(s.asLeader)).toEqual(['Leaders', 'Open', 'Tasks'])
    expect(names(s.asMember)).toEqual(['Open', 'Tasks'])
    expect(names(s.asSecretary)).toEqual(['Open', 'Tasks'])
    expect(names(s.asPastor)).toEqual(['Leaders', 'Open', 'Tasks'])
  })

  it('shows nothing at all to someone with no part in the ministry', () => {
    expect(names(s.asOutsider)).toEqual([])
    expect(names(s.asNobody)).toEqual([])
  })

  it('does not confirm a leaders-only list exists: every door answers 404', () => {
    const doors: Array<() => unknown> = [
      () => tx(t => lib.setItemChecked(t, s.asMember, s.hidden, 'x', true)),
      () => tx(t => lib.addItem(t, s.asMember, s.hidden, { title: 'Sneaky' })),
      () => tx(t => lib.updateList(t, s.asMember, s.hidden, { name: 'Mine now' })),
      () => tx(t => lib.deleteList(t, s.asMember, s.hidden)),
      () => tx(t => lib.reorderItems(t, s.asMember, s.hidden, ['x'])),
      () => lib.loadHistory(s.asMember, s.hidden),
      () => lib.loadHistory(s.asSecretary, s.hidden),
    ]
    for (const door of doors) expect(statusOf(door)).toBe(404)
  })

  it('answers 404, not 403, for a list in a ministry you have no part in', () => {
    expect(statusOf(() => tx(t => lib.addItem(t, s.asOutsider, s.open, { title: 'No' })))).toBe(404)
  })

  it('keeps leaders-only lists off a member’s personal page, and the staff overview off everyone’s', () => {
    const mine = lib.loadMyLists(s.asMember)
    expect(mine.ministries.flatMap(m => m.lists.map(l => l.name)).sort()).toEqual(['Open', 'Tasks'])
    // A pastor who serves nowhere has no ministries of their own to show.
    expect(lib.loadMyLists(s.asPastor)).toEqual({ assigned: [], ministries: [] })
  })

  it('reports what the viewer can do on each list', () => {
    const lists = lib.loadMinistryLists(s.asMember, s.ministryId)
    expect(lists.find(l => l.name === 'Open')).toMatchObject({ canManage: false, canAdd: true, canSeeHistory: false })
    expect(lists.find(l => l.name === 'Tasks')).toMatchObject({ canManage: false, canAdd: false })
  })

  it('offers the roster to assign from to leaders only', () => {
    expect(lib.loadMinistryListsPayload(s.asLeader, s.ministryId).people.length).toBeGreaterThan(0)
    expect(lib.loadMinistryListsPayload(s.asMember, s.ministryId).people).toEqual([])
    expect(lib.loadMinistryListsPayload(s.asPastor, s.ministryId).people).toEqual([])
  })
})

describe('succession', () => {
  it('passes authority to a new leader at once, with no list reassigned', () => {
    const ministryId = newMinistry()
    const first = newPerson('First')
    const second = newPerson('Second')
    join_(ministryId, first.id, { leader: true })
    join_(ministryId, second.id)

    const listId = tx(t => lib.createList(t, viewerOf(first.id, { leads: [ministryId] }), ministryId, { name: 'Handover', kind: 'list', audience: 'ministry', ordered: false }))
    expect(statusOf(() => tx(t => lib.updateList(t, viewerOf(second.id, { serves: [ministryId] }), listId, { name: 'Mine' })))).toBe(403)

    // The church office names the new leader and takes the old one off.
    db.transaction(t => peopleLib.setMinistries(t, first.id, [ministryId], []))
    db.transaction(t => peopleLib.setMinistries(t, second.id, [ministryId], [ministryId]))

    const read = (userPersonId: string) => {
      const row = db.select({ isLeader: schema.ministryMembers.isLeader }).from(schema.ministryMembers)
        .where(orm.and(orm.eq(schema.ministryMembers.ministryId, ministryId), orm.eq(schema.ministryMembers.personId, userPersonId))).get()!
      return viewerOf(userPersonId, row.isLeader ? { leads: [ministryId] } : { serves: [ministryId] })
    }
    expect(statusOf(() => tx(t => lib.updateList(t, read(first.id), listId, { name: 'Still theirs?' })))).toBe(403)
    expect(tx(t => lib.updateList(t, read(second.id), listId, { name: 'Now mine' }))).toEqual(['name'])

    // The list was never theirs: only the history of who made it remains.
    const row = db.select().from(schema.ministryLists).where(orm.eq(schema.ministryLists.id, listId)).get()!
    expect(row.createdBy).toBe(first.id)
    expect(row.ministryId).toBe(ministryId)
  })

  it('builds a viewer from the roster, and only for a signed-in member', () => {
    const ministryId = newMinistry()
    const person = newPerson('Rostered')
    join_(ministryId, person.id, { leader: true })
    const userId = `user-${unique()}`
    db.insert(schema.user).values({ id: userId, name: 'Rostered', email: `${userId}@example.org` }).run()
    db.update(schema.people).set({ userId }).where(orm.eq(schema.people.id, person.id)).run()

    const member = lib.loadListViewer(userId, { isMember: true, staffView: false, staffViewLeadersOnly: false })
    expect([...member.leads]).toEqual([ministryId])
    expect([...member.serves]).toEqual([ministryId])

    // An account without the member role gets no ministry access from its roster row.
    const notMember = lib.loadListViewer(userId, { isMember: false, staffView: false, staffViewLeadersOnly: false })
    expect(notMember.serves.size).toBe(0)
    expect(notMember.leads.size).toBe(0)
  })
})

describe('delegating tasks', () => {
  it('assigns to adults the roster shows, and records who assigned and when', () => {
    const s = scenario()
    const { id } = tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'Set out chairs', assigneeId: s.member.id, dueDate: '2030-01-05' }))
    const view = lib.loadMinistryLists(s.asLeader, s.ministryId).find(l => l.id === s.tasks)!.items.find(i => i.id === id)!
    expect(view.assignee).toMatchObject({ id: s.member.id })
    expect(view.assignedBy).toMatchObject({ id: s.leader.id })
    expect(view.assignedAt).toBeTruthy()
    expect(view.dueDate).toBe('2030-01-05')
  })

  it('refuses people who are not on the roster, minors, guests, and those who asked to be left off it', () => {
    const s = scenario()
    const minor = newPerson('Kid', { isMinor: true })
    const guest = newPerson('Guest', { kind: 'guest' })
    const hiddenPerson = newPerson('Quiet')
    join_(s.ministryId, minor.id)
    join_(s.ministryId, guest.id)
    join_(s.ministryId, hiddenPerson.id, { shown: false })
    for (const id of [s.other.id, minor.id, guest.id, hiddenPerson.id]) {
      expect(statusOf(() => tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'No', assigneeId: id })))).toBe(400)
    }
    const offered = lib.loadAssignable(s.ministryId).map(p => p.id)
    expect(offered).toEqual(expect.arrayContaining([s.leader.id, s.member.id]))
    expect(offered).not.toEqual(expect.arrayContaining([minor.id]))
    expect(offered).not.toEqual(expect.arrayContaining([guest.id]))
    expect(offered).not.toEqual(expect.arrayContaining([hiddenPerson.id]))
  })

  it('gives a task on a leaders-only list to a leader or no one', () => {
    const s = scenario()
    const { id: list } = { id: tx(t => lib.createList(t, s.asLeader, s.ministryId, { name: 'Leader tasks', kind: 'tasks', audience: 'leaders', ordered: false })) }
    expect(statusOf(() => tx(t => lib.addItem(t, s.asLeader, list, { title: 'Plan', assigneeId: s.member.id })))).toBe(400)
    expect(tx(t => lib.addItem(t, s.asLeader, list, { title: 'Plan', assigneeId: s.leader.id })).assigned).toBe(true)
  })

  it('stops a list becoming leaders-only while members hold tasks on it, and says which', () => {
    const s = scenario()
    tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'Bring the urn', assigneeId: s.member.id }))
    let message = ''
    try {
      tx(t => lib.updateList(t, s.asLeader, s.tasks, { audience: 'leaders' }))
    }
    catch (error) {
      message = (error as { statusMessage?: string }).statusMessage ?? ''
    }
    expect(message).toMatch(/not leaders/)
    expect(message).toContain('Bring the urn')

    const items = lib.loadMinistryLists(s.asLeader, s.ministryId).find(l => l.id === s.tasks)!.items
    tx(t => lib.updateItem(t, s.asLeader, s.tasks, items[0]!.id, { assigneeId: null }))
    expect(tx(t => lib.updateList(t, s.asLeader, s.tasks, { audience: 'leaders' }))).toEqual(['audience'])
  })

  it('does not let a plain checklist carry an assignee or a due date', () => {
    const s = scenario()
    expect(statusOf(() => tx(t => lib.addItem(t, s.asLeader, s.open, { title: 'No', assigneeId: s.member.id })))).toBe(400)
    expect(statusOf(() => tx(t => lib.addItem(t, s.asLeader, s.open, { title: 'No', dueDate: '2030-01-01' })))).toBe(400)
  })

  it('needs a date before a time', () => {
    const s = scenario()
    expect(statusOf(() => tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'Late', dueTime: '09:00' })))).toBe(400)
  })

  it('lets only leaders assign, edit and delete', () => {
    const s = scenario()
    expect(statusOf(() => tx(t => lib.addItem(t, s.asMember, s.tasks, { title: 'Mine' })))).toBe(403)
    const { id } = tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'Real' }))
    expect(statusOf(() => tx(t => lib.updateItem(t, s.asMember, s.tasks, id, { title: 'Changed' })))).toBe(403)
    expect(statusOf(() => tx(t => lib.deleteItem(t, s.asMember, s.tasks, id)))).toBe(403)
    expect(statusOf(() => tx(t => lib.deleteItem(t, s.asSecretary, s.tasks, id)))).toBe(403)
  })
})

describe('checking things off', () => {
  it('lets any member work a plain checklist, and records who', () => {
    const s = scenario()
    const { id } = tx(t => lib.addItem(t, s.asMember, s.open, { title: 'Lock up' }))
    expect(tx(t => lib.setItemChecked(t, s.asMember, s.open, id, true))).toBe(true)
    const item = lib.loadMinistryLists(s.asMember, s.ministryId).find(l => l.id === s.open)!.items[0]!
    expect(item.done?.by).toMatchObject({ id: s.member.id })
    // Doing it twice changes nothing.
    expect(tx(t => lib.setItemChecked(t, s.asMember, s.open, id, true))).toBe(false)
  })

  it('lets only the assignee, or a leader, check a task', () => {
    const s = scenario()
    const third = newPerson('Third')
    join_(s.ministryId, third.id)
    const asThird = viewerOf(third.id, { serves: [s.ministryId] })
    const { id } = tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'Mow', assigneeId: s.member.id }))
    expect(statusOf(() => tx(t => lib.setItemChecked(t, asThird, s.tasks, id, true)))).toBe(403)
    expect(statusOf(() => tx(t => lib.setItemChecked(t, s.asSecretary, s.tasks, id, true)))).toBe(403)
    expect(tx(t => lib.setItemChecked(t, s.asMember, s.tasks, id, true))).toBe(true)
    expect(tx(t => lib.setItemChecked(t, s.asLeader, s.tasks, id, false))).toBe(true)
  })

  it('shows an item as checkable only to someone who may check it', () => {
    const s = scenario()
    tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'Mine', assigneeId: s.member.id }))
    tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'Theirs', assigneeId: s.leader.id }))
    const items = lib.loadMinistryLists(s.asMember, s.ministryId).find(l => l.id === s.tasks)!.items
    expect(items.find(i => i.title === 'Mine')).toMatchObject({ canCheck: true, mine: true })
    expect(items.find(i => i.title === 'Theirs')).toMatchObject({ canCheck: false, mine: false })
  })

  it('marks an open task overdue in church time, and a finished one not', () => {
    const s = scenario()
    const { id } = tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'Late', assigneeId: s.member.id, dueDate: '2020-01-01' }))
    const view = () => lib.loadMinistryLists(s.asLeader, s.ministryId).find(l => l.id === s.tasks)!.items.find(i => i.id === id)!
    expect(view().overdue).toBe(true)
    tx(t => lib.setItemChecked(t, s.asMember, s.tasks, id, true))
    expect(view().overdue).toBe(false)
  })
})

describe('history', () => {
  it('records each check with who and when, keeps the title when the item is deleted, and marks a taken-back check', () => {
    const s = scenario()
    const { id } = tx(t => lib.addItem(t, s.asLeader, s.open, { title: 'Sweep' }))
    tx(t => lib.setItemChecked(t, s.asMember, s.open, id, true))
    tx(t => lib.setItemChecked(t, s.asMember, s.open, id, false))
    tx(t => lib.setItemChecked(t, s.asLeader, s.open, id, true))
    tx(t => lib.deleteItem(t, s.asLeader, s.open, id))

    const entries = lib.loadHistory(s.asLeader, s.open)
    expect(entries).toHaveLength(2)
    expect(entries.every(entry => entry.itemTitle === 'Sweep')).toBe(true)
    expect(entries.filter(entry => entry.undoneAt).length).toBe(1)
  })

  it('shows history to leaders and to staff who may read the list, and to no one else', () => {
    const s = scenario()
    expect(() => lib.loadHistory(s.asLeader, s.open)).not.toThrow()
    expect(() => lib.loadHistory(s.asSecretary, s.open)).not.toThrow()
    expect(() => lib.loadHistory(s.asPastor, s.hidden)).not.toThrow()
    expect(statusOf(() => lib.loadHistory(s.asMember, s.open))).toBe(403)
    expect(statusOf(() => lib.loadHistory(s.asSecretary, s.hidden))).toBe(404)
  })

  it('goes when the list does', () => {
    const s = scenario()
    const { id } = tx(t => lib.addItem(t, s.asLeader, s.open, { title: 'Gone soon' }))
    tx(t => lib.setItemChecked(t, s.asLeader, s.open, id, true))
    tx(t => lib.deleteList(t, s.asLeader, s.open))
    expect(db.select().from(schema.ministryListCompletions).where(orm.eq(schema.ministryListCompletions.listId, s.open)).all()).toEqual([])
  })
})

describe('when the roster changes under a task', () => {
  const assigned = () => {
    const s = scenario()
    const { id } = tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'Carry the table', assigneeId: s.member.id }))
    return { ...s, itemId: id }
  }
  const itemFor = (s: ReturnType<typeof assigned>, viewer: import('../../server/lib/ministry-lists').ListViewer) =>
    lib.loadMinistryLists(viewer, s.ministryId).find(l => l.id === s.tasks)!.items.find(i => i.id === s.itemId)!

  it('unassigns a task when its person leaves the ministry, and tells the leaders but not the members', () => {
    const s = assigned()
    db.transaction((t) => {
      peopleLib.setMinistries(t, s.member.id, [], [])
      lib.reconcileAssignments(t)
    })
    const forLeader = itemFor(s, s.asLeader)
    expect(forLeader.assignee).toBeNull()
    expect(forLeader.unassigned?.note).toMatch(/Member Test\d+ is no longer in this ministry/)
    expect(itemFor(s, s.asSecretary).unassigned).toBeNull()
  })

  it('clears the notice when the task is assigned again, or when a leader dismisses it', () => {
    const s = assigned()
    db.transaction((t) => {
      peopleLib.setMinistries(t, s.member.id, [], [])
      lib.reconcileAssignments(t)
    })
    tx(t => lib.dismissUnassignedNotice(t, s.asLeader, s.tasks, s.itemId))
    expect(itemFor(s, s.asLeader).unassigned).toBeNull()

    db.transaction((t) => {
      peopleLib.setMinistries(t, s.member.id, [s.ministryId], [])
      lib.reconcileAssignments(t)
    })
    tx(t => lib.updateItem(t, s.asLeader, s.tasks, s.itemId, { assigneeId: s.member.id }))
    expect(itemFor(s, s.asLeader)).toMatchObject({ unassigned: null, assignee: { id: s.member.id } })
  })

  it('takes a leaders-only task away when its leader stops leading', () => {
    const s = scenario()
    const second = newPerson('Second')
    join_(s.ministryId, second.id, { leader: true })
    const list = tx(t => lib.createList(t, s.asLeader, s.ministryId, { name: 'Elders', kind: 'tasks', audience: 'leaders', ordered: false }))
    const { id } = tx(t => lib.addItem(t, s.asLeader, list, { title: 'Draft the plan', assigneeId: second.id }))
    db.transaction((t) => {
      peopleLib.setMinistries(t, second.id, [s.ministryId], [])
      lib.reconcileAssignments(t)
    })
    const item = lib.loadMinistryLists(s.asLeader, s.ministryId).find(l => l.id === list)!.items.find(i => i.id === id)!
    expect(item.assignee).toBeNull()
    expect(item.unassigned?.note).toMatch(/no longer leads/)
  })

  it('leaves a finished task with the person who did it', () => {
    const s = assigned()
    tx(t => lib.setItemChecked(t, s.asMember, s.tasks, s.itemId, true))
    db.transaction((t) => {
      peopleLib.setMinistries(t, s.member.id, [], [])
      lib.reconcileAssignments(t)
    })
    expect(itemFor(s, s.asLeader)).toMatchObject({ assignee: { id: s.member.id }, unassigned: null })
  })

  it('says so when the person is deleted, instead of clearing the task in silence', () => {
    const s = assigned()
    db.transaction((t) => {
      lib.releaseTasksOf(t, s.member.id)
      t.delete(schema.people).where(orm.eq(schema.people.id, s.member.id)).run()
    })
    const item = itemFor(s, s.asLeader)
    expect(item.assignee).toBeNull()
    expect(item.unassigned?.note).toMatch(/was removed from the directory/)
  })
})

describe('names', () => {
  it('shows a person who asked to be left off the roster, and a minor, as “Someone” to everyone but themselves', () => {
    const s = scenario()
    const quiet = newPerson('Quiet')
    join_(s.ministryId, quiet.id)
    const { id } = tx(t => lib.addItem(t, s.asLeader, s.tasks, { title: 'Greet', assigneeId: quiet.id }))
    // They asked to be left off afterwards.
    db.update(schema.ministryMembers).set({ showToMembers: false })
      .where(orm.and(orm.eq(schema.ministryMembers.ministryId, s.ministryId), orm.eq(schema.ministryMembers.personId, quiet.id))).run()

    const seenBy = (viewer: import('../../server/lib/ministry-lists').ListViewer) =>
      lib.loadMinistryLists(viewer, s.ministryId).find(l => l.id === s.tasks)!.items.find(i => i.id === id)!.assignee
    expect(seenBy(s.asLeader)).toEqual({ id: null, name: 'Someone' })
    expect(seenBy(s.asMember)).toEqual({ id: null, name: 'Someone' })
    expect(seenBy(viewerOf(quiet.id, { serves: [s.ministryId] }))).toMatchObject({ id: quiet.id })
  })
})

describe('ordering', () => {
  it('reorders only with every item named exactly once', () => {
    const s = scenario()
    const a = tx(t => lib.addItem(t, s.asLeader, s.open, { title: 'A' })).id
    const b = tx(t => lib.addItem(t, s.asLeader, s.open, { title: 'B' })).id
    const c = tx(t => lib.addItem(t, s.asLeader, s.open, { title: 'C' })).id
    tx(t => lib.reorderItems(t, s.asLeader, s.open, [c, a, b]))
    expect(lib.loadMinistryLists(s.asLeader, s.ministryId).find(l => l.id === s.open)!.items.map(i => i.title)).toEqual(['C', 'A', 'B'])
    expect(statusOf(() => tx(t => lib.reorderItems(t, s.asLeader, s.open, [a, b])))).toBe(400)
    expect(statusOf(() => tx(t => lib.reorderItems(t, s.asLeader, s.open, [a, a, b])))).toBe(400)
    expect(statusOf(() => tx(t => lib.reorderItems(t, s.asMember, s.open, [a, b, c])))).toBe(403)
  })
})

describe('the personal page', () => {
  it('gathers assigned tasks across ministries, soonest first, then each ministry’s lists', () => {
    const first = newMinistry('Alpha Lists')
    const second = newMinistry('Beta Lists')
    const lead = newPerson('Boss')
    const me = newPerson('Me')
    join_(first, lead.id, { leader: true })
    join_(second, lead.id, { leader: true })
    join_(first, me.id)
    join_(second, me.id)
    const asLead = viewerOf(lead.id, { leads: [first, second] })
    const asMe = viewerOf(me.id, { serves: [first, second] })

    const a = tx(t => lib.createList(t, asLead, first, { name: 'Alpha tasks', kind: 'tasks', audience: 'ministry', ordered: false }))
    const b = tx(t => lib.createList(t, asLead, second, { name: 'Beta tasks', kind: 'tasks', audience: 'ministry', ordered: false }))
    tx(t => lib.createList(t, asLead, second, { name: 'Beta secrets', kind: 'list', audience: 'leaders', ordered: false }))
    tx(t => lib.addItem(t, asLead, a, { title: 'Later', assigneeId: me.id, dueDate: '2031-06-01' }))
    tx(t => lib.addItem(t, asLead, b, { title: 'Sooner', assigneeId: me.id, dueDate: '2031-01-01' }))
    tx(t => lib.addItem(t, asLead, b, { title: 'Undated', assigneeId: me.id }))
    tx(t => lib.addItem(t, asLead, b, { title: 'Not mine', assigneeId: lead.id, dueDate: '2030-01-01' }))

    const page = lib.loadMyLists(asMe)
    expect(page.assigned.map(task => task.item.title)).toEqual(['Sooner', 'Later', 'Undated'])
    expect(page.assigned[0]!.ministry.name).toBe('Beta Lists')
    expect(page.ministries.map(m => m.name)).toEqual(expect.arrayContaining(['Alpha Lists', 'Beta Lists']))
    expect(page.ministries.flatMap(m => m.lists.map(l => l.name))).not.toContain('Beta secrets')

    // The leader sees the leaders-only list on their own page.
    expect(lib.loadMyLists(asLead).ministries.flatMap(m => m.lists.map(l => l.name))).toContain('Beta secrets')
  })

  it('is empty for someone with no ministry', () => {
    expect(lib.loadMyLists(viewerOf(null))).toEqual({ assigned: [], ministries: [] })
    expect(lib.loadMyLists(viewerOf(newPerson('Lone').id))).toEqual({ assigned: [], ministries: [] })
  })
})

describe('removing a ministry', () => {
  it('takes its lists with it, since with no one serving no leader is left to delete them', () => {
    const ministryId = newMinistry()
    const lead = newPerson('Gone')
    join_(ministryId, lead.id, { leader: true })
    const listId = tx(t => lib.createList(t, viewerOf(lead.id, { leads: [ministryId] }), ministryId, { name: 'Orphan', kind: 'list', audience: 'ministry', ordered: false }))
    db.delete(schema.ministryMembers).where(orm.eq(schema.ministryMembers.ministryId, ministryId)).run()
    db.transaction(t => ministriesLib.deleteMinistry(t, ministryId))
    expect(db.select().from(schema.ministryLists).where(orm.eq(schema.ministryLists.id, listId)).all()).toEqual([])
  })
})

describe('routines and their runs', () => {
  // A routine with three steps, in a ministry with a leader, a member and staff.
  const routineScenario = () => {
    const s = scenario()
    const routine = tx(t => lib.createList(t, s.asLeader, s.ministryId, { name: 'Sunday setup', kind: 'routine', audience: 'ministry', ordered: true }))
    for (const title of ['Unlock doors', 'Set out chairs', 'Start coffee']) tx(t => lib.addItem(t, s.asLeader, routine, { title }))
    return { ...s, routine }
  }
  const lists = (s: ReturnType<typeof routineScenario>, viewer: import('../../server/lib/ministry-lists').ListViewer) =>
    lib.loadMinistryLists(viewer, s.ministryId)
  const runsOf = (s: ReturnType<typeof routineScenario>, viewer: import('../../server/lib/ministry-lists').ListViewer) =>
    lists(s, viewer).filter(l => l.routineId === s.routine)

  it('keeps the steps as a template: leaders edit them, nobody ticks them', () => {
    const s = routineScenario()
    const template = lists(s, s.asLeader).find(l => l.id === s.routine)!
    expect(template.items.map(i => i.title)).toEqual(['Unlock doors', 'Set out chairs', 'Start coffee'])
    expect(template.items.every(i => i.canCheck === false)).toBe(true)
    expect(statusOf(() => tx(t => lib.setItemChecked(t, s.asLeader, s.routine, template.items[0]!.id, true)))).toBe(400)
    expect(statusOf(() => tx(t => lib.addItem(t, s.asMember, s.routine, { title: 'Sneak a step in' })))).toBe(403)
    expect(statusOf(() => tx(t => lib.addItem(t, s.asLeader, s.routine, { title: 'Assigned', assigneeId: s.member.id })))).toBe(400)
  })

  it('lets any member start a run, but not staff or someone outside the ministry', () => {
    const s = routineScenario()
    expect(statusOf(() => tx(t => lib.startRun(t, s.asSecretary, s.routine, 'list', false)))).toBe(403)
    expect(statusOf(() => tx(t => lib.startRun(t, s.asPastor, s.routine, 'list', false)))).toBe(403)
    expect(statusOf(() => tx(t => lib.startRun(t, s.asOutsider, s.routine, 'list', false)))).toBe(404)
    expect(statusOf(() => tx(t => lib.startRun(t, s.asNobody, s.routine, 'list', false)))).toBe(404)
    expect(tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id).toBeTruthy()
  })

  it('generates a checklist run from the steps, in order, all unchecked, with a name and who started it', () => {
    const s = routineScenario()
    const { id } = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false))
    const run = lists(s, s.asMember).find(l => l.id === id)!
    expect(run).toMatchObject({ kind: 'list', audience: 'ministry', ordered: true, routineId: s.routine })
    expect(run.name).toMatch(/^Sunday setup · /)
    expect(run.items.map(i => i.title)).toEqual(['Unlock doors', 'Set out chairs', 'Start coffee'])
    expect(run.items.every(i => !i.done)).toBe(true)
    expect(run.run).toMatchObject({ startedBy: { id: s.member.id }, endedAt: null, endedHow: null })
    // It is an ordinary checklist: any member works it, and may add to it.
    expect(run.items.every(i => i.canCheck)).toBe(true)
    expect(run.canAdd).toBe(true)
  })

  it('generates a task run whose steps a leader can give to people, with due dates', () => {
    const s = routineScenario()
    const { id } = tx(t => lib.startRun(t, s.asMember, s.routine, 'tasks', false))
    let run = lists(s, s.asLeader).find(l => l.id === id)!
    expect(run.kind).toBe('tasks')
    expect(run.items.every(i => i.assignee === null && i.dueDate === null)).toBe(true)
    // A member who started it cannot hand tasks out; the leader can.
    expect(statusOf(() => tx(t => lib.updateItem(t, s.asMember, id, run.items[0]!.id, { assigneeId: s.member.id })))).toBe(403)
    tx(t => lib.updateItem(t, s.asLeader, id, run.items[0]!.id, { assigneeId: s.member.id, dueDate: '2030-06-01' }))
    run = lists(s, s.asLeader).find(l => l.id === id)!
    expect(run.items[0]).toMatchObject({ assignee: { id: s.member.id }, dueDate: '2030-06-01' })
    // The assignee ticks only theirs; the others wait for their person.
    expect(tx(t => lib.setItemChecked(t, s.asMember, id, run.items[0]!.id, true))).toBe(true)
    expect(statusOf(() => tx(t => lib.setItemChecked(t, s.asMember, id, run.items[1]!.id, true)))).toBe(403)
    expect(lib.loadHistory(s.asLeader, id)).toHaveLength(1)
  })

  it('shows a member the task run assigned to them on their personal page', () => {
    const s = routineScenario()
    const { id } = tx(t => lib.startRun(t, s.asLeader, s.routine, 'tasks', false))
    const first = lists(s, s.asLeader).find(l => l.id === id)!.items[0]!
    tx(t => lib.updateItem(t, s.asLeader, id, first.id, { assigneeId: s.member.id }))
    expect(lib.loadMyLists(s.asMember).assigned.map(a => a.item.title)).toEqual(['Unlock doors'])
  })

  it('does not let a step change after a run has been generated from it', () => {
    const s = routineScenario()
    const { id } = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false))
    const step = lists(s, s.asLeader).find(l => l.id === s.routine)!.items[0]!
    tx(t => lib.updateItem(t, s.asLeader, s.routine, step.id, { title: 'Unlock ALL the doors' }))
    tx(t => lib.addItem(t, s.asLeader, s.routine, { title: 'Brand new step' }))
    expect(lists(s, s.asLeader).find(l => l.id === id)!.items.map(i => i.title)).toEqual(['Unlock doors', 'Set out chairs', 'Start coffee'])
  })

  it('will not start a run of a routine with no steps, or of anything that is not a routine', () => {
    const s = scenario()
    const empty = tx(t => lib.createList(t, s.asLeader, s.ministryId, { name: 'Empty', kind: 'routine', audience: 'ministry', ordered: false }))
    expect(statusOf(() => tx(t => lib.startRun(t, s.asLeader, empty, 'list', false)))).toBe(409)
    expect(statusOf(() => tx(t => lib.startRun(t, s.asLeader, s.open, 'list', false)))).toBe(400)
  })

  it('keeps one run open at a time, and only replaces it when told to', () => {
    const s = routineScenario()
    const first = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
    const item = lists(s, s.asMember).find(l => l.id === first)!.items[0]!
    tx(t => lib.setItemChecked(t, s.asMember, first, item.id, true))

    expect(statusOf(() => tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)))).toBe(409)
    const second = tx(t => lib.startRun(t, s.asMember, s.routine, 'tasks', true))
    expect(second.replaced).toBe(1)

    const replaced = lists(s, s.asLeader).find(l => l.id === first)!
    expect(replaced.run).toMatchObject({ endedHow: 'ended' })
    expect(replaced.run!.endedAt).toBeTruthy()
    expect(runsOf(s, s.asLeader).filter(r => !r.run!.endedAt)).toHaveLength(1)
  })

  it('finishes a run as complete when every step was done, and as ended when some were not', () => {
    const s = routineScenario()
    const a = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
    for (const item of lists(s, s.asMember).find(l => l.id === a)!.items) tx(t => lib.setItemChecked(t, s.asMember, a, item.id, true))
    expect(tx(t => lib.finishRun(t, s.asMember, a)).complete).toBe(true)

    const b = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
    expect(tx(t => lib.finishRun(t, s.asMember, b)).complete).toBe(false)
    const done = Object.fromEntries(lists(s, s.asLeader).filter(l => l.routineId).map(l => [l.id, l.run!.endedHow]))
    expect(done).toEqual({ [a]: 'complete', [b]: 'ended' })
    expect(statusOf(() => tx(t => lib.finishRun(t, s.asMember, b)))).toBe(409)
    expect(statusOf(() => tx(t => lib.finishRun(t, s.asSecretary, b)))).toBe(409)
  })

  it('makes a finished run a read-only record', () => {
    const s = routineScenario()
    const id = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
    const item = lists(s, s.asMember).find(l => l.id === id)!.items[0]!
    tx(t => lib.finishRun(t, s.asMember, id))
    expect(statusOf(() => tx(t => lib.setItemChecked(t, s.asMember, id, item.id, true)))).toBe(409)
    expect(statusOf(() => tx(t => lib.addItem(t, s.asLeader, id, { title: 'Late' })))).toBe(409)
    expect(statusOf(() => tx(t => lib.updateItem(t, s.asLeader, id, item.id, { title: 'Edited' })))).toBe(409)
    expect(statusOf(() => tx(t => lib.deleteItem(t, s.asLeader, id, item.id)))).toBe(409)
    expect(statusOf(() => tx(t => lib.updateList(t, s.asLeader, id, { name: 'Renamed' })))).toBe(409)
    // A leader can still remove the record.
    expect(() => tx(t => lib.deleteList(t, s.asLeader, id))).not.toThrow()
  })

  it('shows past runs to leaders and the staff who may read the list, and to no one else', () => {
    const s = routineScenario()
    const id = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
    tx(t => lib.finishRun(t, s.asMember, id))
    expect(runsOf(s, s.asLeader).map(r => r.id)).toEqual([id])
    expect(runsOf(s, s.asSecretary).map(r => r.id)).toEqual([id])
    expect(runsOf(s, s.asPastor).map(r => r.id)).toEqual([id])
    expect(runsOf(s, s.asMember)).toEqual([])
    // Nor can a member reach it by id: it does not exist for them.
    expect(statusOf(() => lib.loadHistory(s.asMember, id))).toBe(403)
    // The open run is theirs to see.
    const open = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
    expect(runsOf(s, s.asMember).map(r => r.id)).toEqual([open])
  })

  it('keeps finished runs off the personal page, and their open tasks out of "assigned"', () => {
    const s = routineScenario()
    const id = tx(t => lib.startRun(t, s.asLeader, s.routine, 'tasks', false)).id
    const first = lists(s, s.asLeader).find(l => l.id === id)!.items[0]!
    tx(t => lib.updateItem(t, s.asLeader, id, first.id, { assigneeId: s.leader.id }))
    expect(lib.loadMyLists(s.asLeader).assigned.map(a => a.item.title)).toEqual(['Unlock doors'])
    tx(t => lib.finishRun(t, s.asLeader, id))
    expect(lib.loadMyLists(s.asLeader).assigned).toEqual([])
    expect(lib.loadMyLists(s.asLeader).ministries.flatMap(m => m.lists).filter(l => l.routineId)).toEqual([])
  })

  it('does not release the open tasks of a finished run when their person leaves', () => {
    const s = routineScenario()
    const id = tx(t => lib.startRun(t, s.asLeader, s.routine, 'tasks', false)).id
    const first = lists(s, s.asLeader).find(l => l.id === id)!.items[0]!
    tx(t => lib.updateItem(t, s.asLeader, id, first.id, { assigneeId: s.member.id }))
    tx(t => lib.finishRun(t, s.asLeader, id))
    db.transaction((t) => {
      peopleLib.setMinistries(t, s.member.id, [], [])
      lib.reconcileAssignments(t)
    })
    expect(lists(s, s.asLeader).find(l => l.id === id)!.items[0]).toMatchObject({ assignee: { id: s.member.id }, unassigned: null })
  })

  describe('a leaders-only routine', () => {
    it('is leaders-only throughout: its runs too, and no one else can start one', () => {
      const s = scenario()
      const routine = tx(t => lib.createList(t, s.asLeader, s.ministryId, { name: 'Elders prep', kind: 'routine', audience: 'leaders', ordered: false }))
      tx(t => lib.addItem(t, s.asLeader, routine, { title: 'Pray' }))
      expect(statusOf(() => tx(t => lib.startRun(t, s.asMember, routine, 'list', false)))).toBe(404)
      expect(statusOf(() => tx(t => lib.startRun(t, s.asSecretary, routine, 'list', false)))).toBe(404)
      const run = tx(t => lib.startRun(t, s.asLeader, routine, 'list', false)).id
      const seen = (viewer: import('../../server/lib/ministry-lists').ListViewer) => lib.loadMinistryLists(viewer, s.ministryId).map(l => l.id)
      expect(seen(s.asMember)).not.toContain(run)
      expect(seen(s.asSecretary)).not.toContain(run)
      expect(seen(s.asLeader)).toContain(run)
      expect(seen(s.asPastor)).toContain(run)
      expect(statusOf(() => tx(t => lib.setItemChecked(t, s.asMember, run, 'x', true)))).toBe(404)
    })

    it('hides a routine’s runs, past ones included, the moment the routine is made leaders-only', () => {
      const s = routineScenario()
      const past = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
      tx(t => lib.finishRun(t, s.asMember, past))
      const open = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
      expect(lists(s, s.asMember).map(l => l.id)).toContain(open)

      tx(t => lib.updateList(t, s.asLeader, s.routine, { audience: 'leaders' }))
      const seenByMember = lists(s, s.asMember).map(l => l.id)
      expect(seenByMember).not.toContain(open)
      expect(seenByMember).not.toContain(past)
      expect(lists(s, s.asSecretary).map(l => l.id)).not.toContain(past)
      expect(lists(s, s.asLeader).map(l => l.id)).toEqual(expect.arrayContaining([s.routine, open, past]))
    })

    it('stops that change while members hold open tasks in a run, and says where', () => {
      const s = routineScenario()
      const run = tx(t => lib.startRun(t, s.asLeader, s.routine, 'tasks', false)).id
      const step = lists(s, s.asLeader).find(l => l.id === run)!.items[0]!
      tx(t => lib.updateItem(t, s.asLeader, run, step.id, { assigneeId: s.member.id }))
      let message = ''
      try { tx(t => lib.updateList(t, s.asLeader, s.routine, { audience: 'leaders' })) }
      catch (error) { message = (error as { statusMessage?: string }).statusMessage ?? '' }
      expect(message).toMatch(/not leaders/)
      expect(message).toContain('Sunday setup')
    })

    it('refuses to change a run’s audience directly: it follows its routine', () => {
      const s = routineScenario()
      const run = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
      expect(statusOf(() => tx(t => lib.updateList(t, s.asLeader, run, { audience: 'leaders' })))).toBe(400)
    })
  })

  it('removes its runs, their items and their history when the routine is deleted', () => {
    const s = routineScenario()
    const run = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
    const item = lists(s, s.asMember).find(l => l.id === run)!.items[0]!
    tx(t => lib.setItemChecked(t, s.asMember, run, item.id, true))
    tx(t => lib.deleteList(t, s.asLeader, s.routine))
    const count = (table: 'ministryLists' | 'ministryListItems' | 'ministryListCompletions', column: 'id' | 'listId') =>
      db.select().from(schema[table]).where(orm.eq((schema[table] as never as Record<string, never>)[column], run as never)).all().length
    expect(count('ministryLists', 'id')).toBe(0)
    expect(count('ministryListItems', 'listId')).toBe(0)
    expect(count('ministryListCompletions', 'listId')).toBe(0)
  })

  it('lets a member who started a run see who started it, masking a hidden person', () => {
    const s = routineScenario()
    const quiet = newPerson('Quiet')
    join_(s.ministryId, quiet.id, { shown: false })
    const run = tx(t => lib.startRun(t, viewerOf(quiet.id, { serves: [s.ministryId] }), s.routine, 'list', false)).id
    const startedBy = (viewer: import('../../server/lib/ministry-lists').ListViewer) => lists(s, viewer).find(l => l.id === run)!.run!.startedBy
    expect(startedBy(s.asMember)).toEqual({ id: null, name: 'Someone' })
    expect(startedBy(viewerOf(quiet.id, { serves: [s.ministryId] }))).toMatchObject({ id: quiet.id })
  })

  it('shows what each viewer may do with a routine and its run', () => {
    const s = routineScenario()
    const run = tx(t => lib.startRun(t, s.asMember, s.routine, 'list', false)).id
    const as = (viewer: import('../../server/lib/ministry-lists').ListViewer) => ({
      routine: lists(s, viewer).find(l => l.id === s.routine)!,
      run: lists(s, viewer).find(l => l.id === run)!,
    })
    expect(as(s.asMember).routine).toMatchObject({ canStartRun: true, canManage: false, canAdd: false })
    expect(as(s.asMember).run).toMatchObject({ canEndRun: true, canStartRun: false })
    expect(as(s.asLeader).routine).toMatchObject({ canStartRun: true, canManage: true, canAdd: true })
    expect(as(s.asSecretary).routine).toMatchObject({ canStartRun: false })
    expect(as(s.asSecretary).run).toMatchObject({ canEndRun: false })
  })
})

describe('a list for leaders and the people given a task', () => {
  type Viewer = import('../../server/lib/ministry-lists').ListViewer
  // Tasks list for leaders and assignees, with one task each for two members.
  const assignedScenario = () => {
    const s = scenario()
    const third = newPerson('Third')
    join_(s.ministryId, third.id)
    const listId = tx(t => lib.createList(t, s.asLeader, s.ministryId, { name: 'Visits', kind: 'tasks', audience: 'assigned', ordered: false, assigneesSeeAll: false }))
    const mine = tx(t => lib.addItem(t, s.asLeader, listId, { title: 'Visit the Smiths', assigneeId: s.member.id })).id
    const theirs = tx(t => lib.addItem(t, s.asLeader, listId, { title: 'Visit the Joneses', assigneeId: third.id })).id
    const unassigned = tx(t => lib.addItem(t, s.asLeader, listId, { title: 'Visit the Browns' })).id
    const asAssignee = viewerOf(s.member.id, { serves: [s.ministryId], assigned: [listId] })
    const asOtherAssignee = viewerOf(third.id, { serves: [s.ministryId], assigned: [listId] })
    return { ...s, third, listId, mine, theirs, unassigned, asAssignee, asOtherAssignee }
  }
  const seen = (s: ReturnType<typeof assignedScenario>, viewer: Viewer) => lib.loadMinistryLists(viewer, s.ministryId).find(l => l.id === s.listId)
  const titles = (s: ReturnType<typeof assignedScenario>, viewer: Viewer) => seen(s, viewer)?.items.map(i => i.title).sort()

  it('is seen by leaders, pastors and people holding a task on it', () => {
    const s = assignedScenario()
    expect(seen(s, s.asLeader)).toBeTruthy()
    expect(seen(s, s.asPastor)).toBeTruthy()
    expect(seen(s, s.asAssignee)).toBeTruthy()
    expect(seen(s, s.asOtherAssignee)).toBeTruthy()
  })

  it('does not show it to a member who holds no task on it, nor to the secretary or an outsider', () => {
    const s = assignedScenario()
    const noTask = viewerOf(s.other.id, { serves: [s.ministryId] })
    expect(seen(s, noTask)).toBeUndefined()
    expect(seen(s, s.asSecretary)).toBeUndefined()
    expect(seen(s, s.asOutsider)).toBeUndefined()
    expect(seen(s, s.asNobody)).toBeUndefined()
    expect(statusOf(() => tx(t => lib.setItemChecked(t, noTask, s.listId, s.mine, true)))).toBe(404)
    expect(statusOf(() => lib.loadHistory(noTask, s.listId))).toBe(404)
  })

  it('shows an assignee only their own tasks by default, and leaders and pastors all of them', () => {
    const s = assignedScenario()
    expect(titles(s, s.asAssignee)).toEqual(['Visit the Smiths'])
    expect(titles(s, s.asOtherAssignee)).toEqual(['Visit the Joneses'])
    expect(titles(s, s.asLeader)).toEqual(['Visit the Browns', 'Visit the Joneses', 'Visit the Smiths'])
    expect(titles(s, s.asPastor)).toEqual(['Visit the Browns', 'Visit the Joneses', 'Visit the Smiths'])
  })

  it('does not even confirm another person’s task exists: checking it is a 404', () => {
    const s = assignedScenario()
    expect(statusOf(() => tx(t => lib.setItemChecked(t, s.asAssignee, s.listId, s.theirs, true)))).toBe(404)
    expect(statusOf(() => tx(t => lib.setItemChecked(t, s.asAssignee, s.listId, s.unassigned, true)))).toBe(404)
    expect(tx(t => lib.setItemChecked(t, s.asAssignee, s.listId, s.mine, true))).toBe(true)
  })

  it('lets the leader choose to show assignees everyone’s tasks, but only the assignee can check their own', () => {
    const s = assignedScenario()
    expect(tx(t => lib.updateList(t, s.asLeader, s.listId, { assigneesSeeAll: true }))).toEqual(['assigneesSeeAll'])
    expect(titles(s, s.asAssignee)).toEqual(['Visit the Browns', 'Visit the Joneses', 'Visit the Smiths'])
    const view = seen(s, s.asAssignee)!
    expect(view.items.find(i => i.title === 'Visit the Smiths')!.canCheck).toBe(true)
    expect(view.items.find(i => i.title === 'Visit the Joneses')!.canCheck).toBe(false)
    // Visible now, so the refusal is the ordinary one.
    expect(statusOf(() => tx(t => lib.setItemChecked(t, s.asAssignee, s.listId, s.theirs, true)))).toBe(403)
    // The same switch turned back off hides them again.
    tx(t => lib.updateList(t, s.asLeader, s.listId, { assigneesSeeAll: false }))
    expect(titles(s, s.asAssignee)).toEqual(['Visit the Smiths'])
  })

  it('keeps the other rules for an assignee: no managing, adding, history or roster', () => {
    const s = assignedScenario()
    const view = seen(s, s.asAssignee)!
    expect(view).toMatchObject({ canManage: false, canAdd: false, canSeeHistory: false })
    expect(statusOf(() => tx(t => lib.addItem(t, s.asAssignee, s.listId, { title: 'Mine now' })))).toBe(403)
    expect(statusOf(() => tx(t => lib.updateList(t, s.asAssignee, s.listId, { name: 'Renamed' })))).toBe(403)
    expect(statusOf(() => lib.loadHistory(s.asAssignee, s.listId))).toBe(403)
    expect(lib.loadMinistryListsPayload(s.asAssignee, s.ministryId).people).toEqual([])
  })

  it('takes the list away the moment someone holds no task on it, and gives it when they get one', () => {
    const ministryId = newMinistry()
    const lead = newPerson('Boss')
    const worker = newPerson('Worker')
    join_(ministryId, lead.id, { leader: true })
    join_(ministryId, worker.id)
    const userId = `user-${unique()}`
    db.insert(schema.user).values({ id: userId, name: 'Worker', email: `${userId}@example.org` }).run()
    db.update(schema.people).set({ userId }).where(orm.eq(schema.people.id, worker.id)).run()
    const asLead = viewerOf(lead.id, { leads: [ministryId] })
    const listId = tx(t => lib.createList(t, asLead, ministryId, { name: 'Visits', kind: 'tasks', audience: 'assigned', ordered: false, assigneesSeeAll: false }))
    const load = () => lib.loadListViewer(userId, { isMember: true, staffView: false, staffViewLeadersOnly: false })
    const names = () => lib.loadMinistryLists(load(), ministryId).map(l => l.name)

    expect(names()).toEqual([])
    const { id } = tx(t => lib.addItem(t, asLead, listId, { title: 'Call Ann', assigneeId: worker.id }))
    expect(names()).toEqual(['Visits'])
    expect(lib.loadMyLists(load()).ministries.flatMap(m => m.lists.map(l => l.name))).toEqual(['Visits'])

    tx(t => lib.updateItem(t, asLead, listId, id, { assigneeId: null }))
    expect(names()).toEqual([])
    expect(lib.loadMyLists(load()).ministries).toEqual([])
  })

  it('takes the list away from a person who leaves the ministry, and does not count the access of a non-member', () => {
    const s = assignedScenario()
    db.transaction((t) => {
      peopleLib.setMinistries(t, s.member.id, [], [])
      lib.reconcileAssignments(t)
    })
    // The viewer is rebuilt from the roster; with no roster row they serve nowhere.
    expect(seen(s, viewerOf(s.member.id, { assigned: [s.listId] }))).toBeUndefined()
  })

  it('is refused for a checklist and for a routine, which have no assignees', () => {
    const s = scenario()
    expect(statusOf(() => tx(t => lib.createList(t, s.asLeader, s.ministryId, { name: 'No', kind: 'list', audience: 'assigned', ordered: false, assigneesSeeAll: false })))).toBe(400)
    expect(statusOf(() => tx(t => lib.createList(t, s.asLeader, s.ministryId, { name: 'No', kind: 'routine', audience: 'assigned', ordered: false, assigneesSeeAll: false })))).toBe(400)
    expect(statusOf(() => tx(t => lib.updateList(t, s.asLeader, s.open, { audience: 'assigned' })))).toBe(400)
    expect(tx(t => lib.updateList(t, s.asLeader, s.tasks, { audience: 'assigned' }))).toEqual(['audience'])
  })

  it('cannot be made leaders-only while members hold open tasks on it, and the switch resets when the audience moves on', () => {
    const s = assignedScenario()
    tx(t => lib.updateList(t, s.asLeader, s.listId, { assigneesSeeAll: true }))
    expect(statusOf(() => tx(t => lib.updateList(t, s.asLeader, s.listId, { audience: 'leaders' })))).toBe(409)
    expect(tx(t => lib.updateList(t, s.asLeader, s.listId, { audience: 'ministry' }))).toEqual(expect.arrayContaining(['audience', 'assigneesSeeAll']))
    expect(seen(s, s.asLeader)).toMatchObject({ audience: 'ministry', assigneesSeeAll: false })
  })

  it('stays hidden from the staff view that has no leaders-only access, and is read by a pastor', () => {
    const s = assignedScenario()
    expect(seen(s, s.asSecretary)).toBeUndefined()
    expect(seen(s, s.asPastor)).toMatchObject({ canManage: false, canSeeHistory: true })
    expect(() => lib.loadHistory(s.asPastor, s.listId)).not.toThrow()
    expect(statusOf(() => lib.loadHistory(s.asSecretary, s.listId))).toBe(404)
  })
})

describe('the permission grants', () => {
  it('gives the pastor both staff views, the secretary the ordinary one, and no one else any', async () => {
    const { roles } = await import('../../shared/auth/permissions')
    const allows = (role: keyof typeof roles, permissions: Record<string, string[]>) => roles[role].authorize(permissions as never).success
    expect(allows('pastor', { ministryList: ['view'] })).toBe(true)
    expect(allows('pastor', { ministryList: ['viewLeadersOnly'] })).toBe(true)
    expect(allows('churchSecretary', { ministryList: ['view'] })).toBe(true)
    expect(allows('churchSecretary', { ministryList: ['viewLeadersOnly'] })).toBe(false)
    for (const role of ['admin', 'member', 'directoryManager', 'contentEditor', 'deacon', 'treasurer', 'counter', 'financeCommittee'] as const) {
      expect(allows(role, { ministryList: ['view'] })).toBe(false)
      expect(allows(role, { ministryList: ['viewLeadersOnly'] })).toBe(false)
    }
  })
})
