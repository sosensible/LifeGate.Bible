# Spec: Ministry lists (lists, tasks, routines)

Status: **phase 1 and on-demand routines built 2026-10-22; nothing committed or deployed.** Routine schedules (the optional repeat) are not started.
Owner: John · Target: this site (Nuxt 4 + Nuxt UI v4, Drizzle + better-sqlite3)
Modelled on soPortal's lists (`~/Projects/soPortal/docs/specs/tasks.md`), changed
for a church: the audience is a ministry, not a household, and the church keeps
a light record of who did what.

## Goal

Give each ministry three kinds of list to run itself with:

- **List**: a checklist. Plain items that are checked off.
- **Tasks**: items that can be delegated to a person, with a due date.
- **Routine**: a checklist that repeats on a schedule ("Sunday setup", every
  Sunday). Each run starts unchecked.

Members of a ministry use them on that ministry's page. Each person also has one
**personal page** that gathers their work from every ministry they serve in, so
nobody chases in and out of ministry pages.

## Decisions already made

| Question | Decision |
|---|---|
| Who manages a ministry's lists | The ministry's **leader(s)**, read live from `ministry_members.isLeader`. Authority passes with the leader role (see [Succession](#succession)). |
| What members may do | Check items off; add items to plain checklists. |
| Delegation | A task is assigned to **any member of that ministry**. |
| Done items | A **light history** is kept: who completed what, and when. |
| Reminders | **In-app only.** No email, no scheduler in the container. |
| Routines | A **scheduled repeating checklist**; one run can be skipped or moved without changing the schedule. |
| Who sees a list | Members of the ministry. **Pastors and the church secretary** can read every ministry's lists, read-only. |
| Leaders-only lists | A list may be marked **leaders only**. Only the ministry's leaders and **pastors** see it. The church secretary does **not**. |
| Placement | A **Lists** section on each ministry page, plus a **personal page**. |

## Out of scope

- Email or push notifications; reminders of any kind outside the app.
- Reports, streaks, points, completion statistics.
- Sub-tasks, priorities, tags, attachments, comments, projects.
- Assigning across ministries (a Deacons task to a Youth leader).
- Voice input, and anything public. Nothing here is visible to visitors.

## Kinds

| Kind | Items carry | Members may |
|---|---|---|
| `list` | title | check, **add** |
| `tasks` | title, assignee, due date | the assignee checks their own; leaders check any |
| `routine` | title | check items in the current run |

Any list can be `ordered` (numbered steps, next open step highlighted). Routines
start ordered. Items are reordered with up/down controls in edit mode.

Only leaders create, rename, reorder and delete lists, add or edit items on
`tasks` and `routine` lists, assign, and change a list's audience or schedule.

## Audience

Each list has `audience`:

| Audience | Who sees it |
|---|---|
| `ministry` (default) | Everyone serving in the ministry, plus pastors and the church secretary (read-only). |
| `leaders` | The ministry's leaders, and pastors. Nobody else. |
| `assigned` | The leaders, pastors, and **each person currently holding a task on it**. Task lists only. |

On an `assigned` list the leader chooses, per list, whether an assignee also sees the
tasks given to other people (`assignees_see_all`, off by default). Off, each person sees
only their own tasks. Either way only the person a task is given to can tick it off;
leaders can also tick on someone's behalf, since an assignee may have no login.

The rule that governs everything below: **nobody sees, counts, searches or edits
what they cannot see.** A list someone cannot see does not exist as far as they are
concerned. That means it is absent from the ministry page, the personal page, counts
and badges, search, and the history. It is filtered in the query, not hidden in the
UI, and anything not visible answers 404, never 403. On an `assigned` list that also
covers other people's tasks while the switch is off: checking one is a 404.

## Who may do what

| Actor | `ministry` list | `leaders` list |
|---|---|---|
| Ministry leader | everything | everything |
| Ministry member | see; check; add to plain lists; see own tasks | **no access** |
| Pastor | read-only | read-only |
| Church secretary | read-only | **no access** |
| Admin | only as a member of that ministry | only as a leader of it |
| Anyone else | no access | no access |

"Admin gets nothing special" is an assumption, in line with how stewardship and
pastoral applications exclude admins. Confirm before building (see
[Open questions](#open-questions)).

Staff access is a **permission**, not membership: add `ministryList` to the
statement in `shared/auth/permissions.ts` with `view` (pastor, church secretary)
and `viewLeadersOnly` (pastor only). Leader and member access is **derived from
the roster**, the way Missions editors are (`servesInMissionsMinistry` in
`server/lib/missions.ts`), not from a role.

## Succession

Lists belong to the **ministry**, never to the person who made them. There is no
owner field that carries authority; `createdBy` is history only.

- When the church office names a new leader, they can manage at once.
- When someone stops being leader, they lose manage rights at once and keep
  member rights if they still serve.
- A ministry may have several leaders; any of them manages.
- No list is reassigned, because none is ever assigned to a leader as such.

Because the check reads `isLeader` on every request, there is nothing to migrate
when the leader changes.

## Delegating tasks

- Assignee must be a **current member of that ministry**.
- A person with no account can be named, so a leader can track the work and
  check it off for them. Only people with accounts have the personal page.
- On a **leaders-only** list the assignee must be a **leader** of that ministry.
  Anything else would hand someone a task on a list they cannot see.
- `assignedBy` and `assignedAt` are stored.

### Keeping assignments consistent

These are enforced where the roster changes (`server/lib/ministries.ts`), in the
same transaction as the change:

- Someone removed from a ministry: their open tasks there become **unassigned**.
- Someone's leader flag removed: their tasks on **leaders-only** lists become
  unassigned.
- A leader marking a list leaders-only while members hold tasks on it: refused
  with the list of tasks to reassign first.

## Routines (phase 2)

A routine is a reusable checklist: a template of steps that a ministry works
through again and again ("Sunday setup", "Close up the building"). The steps belong
to the template; each time it is worked is a **run**.

**Settled by John, 2026-10-22:** a run starts **on demand** (a Start button) **or**
on an optional **schedule**, and **any member** of the ministry may start one.
Leaders still own the template: its name, steps, audience and schedule.

### Runs

A run is **an ordinary list generated from the routine**, so every rule, screen and
record for lists applies to it unchanged.

- **Style is chosen when the run is started:** a **checklist** (anyone serving ticks
  steps off) or **tasks** (the steps become tasks a leader can give to people, with
  due dates). The same routine can produce either, run by run.
- A run copies the routine's steps in order, all unchecked, and is named
  "Routine name · Oct 25". Editing the template later never changes a run already
  started.
- Checks, assignments, the unassigned-task notice, name masking, history and the
  personal page all work on a run exactly as on any list. Each run has its own history.
- A routine has at most **one open run**. Starting another while one is open is
  refused unless the person confirms; the open one is then finished as unfinished and
  kept as a past run.
- **Finishing is explicit** ("Finish run"), by any member who serves. The run records
  `complete` if every step was done, otherwise `ended`. It does not close itself on the
  last tick: that could not be taken back. A finished run is a **read-only record**.
- Past runs are read by leaders and by staff who may read the list, exactly like
  history. Members see only the open run. A leader may delete a past run.
- A run always has its routine's audience. Making a routine leaders-only changes
  every run, finished ones included, in the same step, and is refused while members
  hold open tasks in an open run.
- Deleting a routine deletes its runs, their items and their history.

### Schedule (optional)

- Start date, optional time, and a repeat: daily, weekdays, weekly on chosen days,
  or monthly. A routine with no schedule is purely on-demand.
- **No background job.** The container has no scheduler and none is added. A
  scheduled run is created the first time anyone opens the routine on or after its
  occurrence; until then it does not exist. This is why no reminders or emails go
  out (still out of scope).
- Because nothing fires on its own, an occurrence nobody opens the list for simply
  produces no run. The list shows "Due: Sun, Oct 25" until it is started.
- One occurrence can be **skipped** or **moved** (another day or time) without
  changing the schedule, by leaders, from "Coming up". **Put back** undoes it.
  Exceptions are keyed by the occurrence's regular date and dropped after two weeks.

### Where it shows

- The ministry page: the routine's steps, a **Start a run** button (checklist or
  tasks), and the open run as its own card beside it. Past runs are behind a button on
  the routine.
- The personal page: the open run, and any task assigned to you in it. Finished runs
  and their open tasks never appear there.

### Data

Runs are rows in `ministry_lists`, so there is no separate runs table:

```
ministry_lists  + routine_id → ministry_lists (cascade)   set on a run
                + ended_at, ended_how ('complete'|'ended')  set when it is finished
```

A routine is a list with `kind = 'routine'`; its steps are ordinary items and are
never ticked. A run has `kind = 'list'` or `'tasks'`.

### Who may do what

| Action | Leader | Member | Staff |
|---|---|---|---|
| Edit template, schedule, skip/move | yes | no | no |
| Start a run, end a run | yes | **yes** | no |
| Check steps in the open run | yes | **yes** | no |
| Read past runs | yes | no | yes, where they may read the list |

A leaders-only routine is leaders only throughout, as for every kind.

### Still to decide

- **Recurrence engine:** `rrule`, or a port of soPortal's ~60-line `listRepeat.ts`.
  Prefer the proven module if it fits the simple repeats above.
- Whether an on-demand routine may have **two open runs** at once (two crews at two
  doors). Assumed **no**; one at a time.

## History

Recorded in `ministry_list_completions`. One row per check: list, item, a
**snapshot of the item title**, run key (routines), who, when. The snapshot
means deleting an item does not erase the fact it was done. Unchecking removes
that row's effect (it is marked undone, not silently erased).

History is visible to the list's leaders, and to staff who may see that list.
It follows the list's audience exactly, so history of a leaders-only list never
reaches a member. There are no reports, no totals, no rankings.

Deleting a list deletes its items and its history. Removing a person does not
delete history; their name is kept as a snapshot.

## The personal page

One page for the signed-in person, e.g. `/my/lists`:

1. **Assigned to me**, across every ministry: open tasks by due date, overdue
   first, and routines with a run due today.
2. **Then each ministry they serve in**, with the lists they may see there.

It shows only what the viewer may see: no leaders-only lists unless they lead
that ministry, and a leader of Ministry A gets nothing from Ministry B. A person
with no ministry sees an empty-state message. Someone with no account has no
page.

## Data model

```
ministry_lists
  id, ministry_id → ministries (cascade), name, kind ('list'|'tasks'|'routine'),
  audience ('ministry'|'leaders'), ordered, sort_order,
  schedule (json, routines only), created_by → people (set null),
  created_at, updated_at

ministry_list_items
  id, list_id → ministry_lists (cascade), title, sort_order,
  assignee_person_id → people (set null), assigned_by → people (set null),
  assigned_at, due_date, due_time,
  done_at, done_by → people (set null)        -- lists and tasks only

ministry_list_completions
  id, list_id → ministry_lists (cascade), item_id (no FK: survives deletion),
  item_title, run_key (null unless routine), done_by → people (set null),
  done_by_name, done_at, undone_at
```

A routine's per-run check state is read from `ministry_list_completions` for the
current run key, not from the item row.

Migrations are generated with drizzle-kit like the rest of the schema and apply
automatically at startup (`server/plugins/migrate.ts`).

## API sketch

```
GET    /api/ministries/:slug/lists            lists the actor may see
POST   /api/ministries/:slug/lists            leader
PUT    /api/ministry-lists/:id                leader (name, audience, ordered, schedule)
DELETE /api/ministry-lists/:id                leader
POST   /api/ministry-lists/:id/items          leader; any member on kind=list
PUT    /api/ministry-lists/:id/items/:item    leader
DELETE /api/ministry-lists/:id/items/:item    leader
POST   /api/ministry-lists/:id/items/:item/check   { done, runKey? }
PUT    /api/ministry-lists/:id/items/order    leader
GET    /api/ministry-lists/:id/history        leader / staff who may see the list
GET    /api/me/lists                          the personal page
PUT    /api/ministry-lists/:id/runs/:date     leader (phase 2: skip, move, restore)
```

Every route resolves access through **one** function, so no route can forget the
leaders-only rule. Creating or deleting a list, changing its audience, and
assigning a task go through `recordAudit`.

## UI

Nuxt UI components throughout, no hand-built equivalents. The ministry page
(`app/pages/ministries/[slug].vue`) gains a members-only **Lists** section. The
personal page is new.

## Tests

The access rules are the risk, so they get the most tests:

- A matrix of actor × list audience × action, with every cell asserted.
- **Leaders-only leakage**: a member must not learn a leaders-only list exists
  through the ministry page, the personal page, counts, history, or a direct
  `GET` by id (404, not 403).
- Succession: change the leader, then the old leader is refused and the new one
  accepted, with no other change.
- Roster changes unassign tasks as listed above, in one transaction.
- Assigning a non-leader on a leaders-only list is refused.
- Phase 2: run keys, skip, move, and that exceptions don't alter the schedule.

## Phasing

1. **Phase 1**: lists and tasks, the audience flag, history, the ministry-page
   section, the personal page, staff read access.
2. **Phase 2**: routines: on-demand runs first, then the optional schedule.

## Settled questions

1. **Admins** see only the ministries they belong to.
2. **Checking a task:** the assignee or a leader.
3. **Routine checks** are shared: any member may check any item in the current run.
4. **History for staff:** staff who may read a list also see its history, names included.
5. **Recurrence** is phase 2: `rrule` if it fits, otherwise a port of soPortal's engine.
6. **Unassigned tasks:** when a roster change unassigns a task, the ministry's leaders
   see an in-app notice on that ministry's Lists section. It names the task and why
   ("Sam is no longer in this ministry") and clears when the task is assigned again or
   a leader dismisses it. Stored on the item (`unassigned_at`, `unassigned_note`), so
   it is the same record the task already is, not a second notification system.

## Decided while building phase 1

These were not in the approved spec. Each follows from a rule the app already had.

- **Names follow the roster's privacy.** A minor, or someone who asked to be left
  off a ministry's roster, shows as "Someone" on that ministry's lists, for everyone
  but themselves. They also cannot be offered in the assign-to picker or be given a
  task. Otherwise a task would announce who serves in a ministry that the roster
  hides. A person who asks to be left off *after* being given a task keeps it, but is
  shown as "Someone".
- **A list's kind is fixed once made.** Turning tasks into a plain checklist would
  quietly drop the assignees and due dates.
- **A plain checklist rejects an assignee or due date** (400) rather than ignoring them.
- **Removing a ministry removes its lists.** A ministry can only be removed once nobody
  serves in it, so no leader is left who could delete them; refusing would strand them.
- **Lists are never in the offline cache.** The service worker stores ministry answers
  for offline reading, but a copy would keep showing a former leader the leaders-only
  lists. They are fetched in the browser (so they are not in the stored page HTML
  either) and the worker skips `/api/ministries/:slug/lists`.
- **Unassignment runs on every roster edit, and before a person is deleted.** The
  foreign key would otherwise clear a deleted person's tasks without any notice. Done
  tasks keep their assignee: that is the record of who did it.
- **Audit entries** (`ministryList.create/update/delete/assign`) name the list, never its
  items or the people on it.
- **The personal page is `/my-lists`.** Its menu entry appears only for someone who
  serves in a ministry with lists. It shows no staff overview: a pastor sees other
  ministries' lists on those ministries' own pages.

## Decided while building routines

- **A run is a list, not its own record type.** This was chosen over a runs table
  because it gives checklists and task-style runs for free, with every existing rule,
  test and screen.
- **Finishing is explicit**, not automatic on the last tick (spec said automatic).
- **No scheduler and no schedule yet.** On-demand runs are built. The optional
  schedule (and with it skip/move and the repeat engine) is still to do; it can be
  added later by creating a run when someone first opens the routine on or after its
  due date.
- **Finished runs are filtered in the query** for anyone who may not read history, and
  again after it, like leaders-only lists. A finished run's open tasks are never
  released or shown as assigned.

## Decided while building "leaders and assigned people"

- **Task lists only.** A checklist has no assignees, and a routine's runs copy the
  routine's audience, so neither offers it.
- **Holding a task is read fresh on every request.** Un-assigning someone's last task,
  or them leaving the ministry, takes the list away at once.
- **Staff:** pastors read it like a leaders-only list (all tasks); the church secretary
  does not see it.
- **The assignee's own view** is the ordinary task card, with only their tasks. They
  get no history, no roster to assign from, and cannot add or edit.
- **Changing the audience:** to `leaders` is refused while members hold open tasks on
  the list; away from `assigned`, the "see everyone's tasks" switch resets to off.
