# Spec: Member page

Status: **built 2026-10-23; not committed or deployed.**
Owner: John · Target: this site (Nuxt 4 + Nuxt UI v4)

## Goal

One page for each person in the church directory. Anyone signed in as a member can
open it and sees what that person has chosen to share, who they serve with, and, for
a speaker, their messages. **When you open your own page it shows more**: what is
waiting for you across the church (tasks, lists, teaching, ministry budgets), so you
do not have to visit a separate page for each.

It replaces nothing. `/profile`, `/my-teaching`, `/my-lists` and `/ministry-budget`
stay where they are; the page summarises them and links out.

## Decisions already made

| Question | Decision |
|---|---|
| Who may open a member page | **Signed-in members only.** Nothing on it is public. |
| What the owner sees extra | Assigned tasks and open runs; my lists by ministry; my teaching; ministry budgets. |
| Existing pages | **Kept**, linked from the member page. Nothing moves, no address breaks. |
| How people reach their own page | A **"My page" tile** on Welcome Home (`/members`) and an entry in the **account menu**. |
| Minors | Staff see them (as in the directory). **The adults of a minor's household see them too.** Everyone else gets a 404. |
| Ministry rosters | On a ministry's page, each person's card **opens their page**, for any viewer who can see the roster. |

## Out of scope

- Fold the existing personal pages into this one, or redirect them.
- A public page for anyone, speakers included.
- Showing staff or administrators anything of a person's private sections.
- Editing someone else's details from their page (the directory admin already does that).
- Calendar, prayer requests and anything else on the owner's page beyond the four sections above.

## Address and entry points

- **`/people/[id]`**: any person. (Not `/members/[id]`: `/members` is the Welcome Home
  page, and nesting under it would turn it into a layout.)
- **`/me`**: your own page. It sends you to `/people/<your id>`. If your account is not
  connected to a person in the directory it shows a plain explanation instead (see
  [Accounts with no person](#accounts-with-no-person)).
- **Links in:** the Welcome Home tile, the account menu, a name in the directory, the
  Speakers list and a message's speaker on the Teaching pages.

## What everyone sees

The same rules as the directory, applied by the same code (`presentPerson`), so the page
can never show more than the directory does:

- **Name and title**, and a photo only if they shared it.
- **Contact details and birthday** only the parts they chose to share. Staff see
  contact details as they do in the directory.
- **Household** only if shared.
- **Ministries they serve in**, leaders marked, leaving out any ministry they asked not
  to be shown on, with a link to each ministry's page.
- **Minors** are not shown to other members. Staff see them, as in the directory, and so do
  the adults of the minor's household (see below). A minor with an account sees their own page.
- **Guests** (people who are not members, such as a guest speaker) have a page too: name,
  title, the contact details they chose to share, and their messages. They have no
  ministries.

### Speakers

If the person has given messages, the page lists them: title, date, series and passage,
each linking to the message. A viewer sees only the messages they could open on the
Teaching pages (the existing visibility rule, reused, not copied). Members who are
speakers and guest speakers look the same.

## What the owner sees extra

Sent only to the person looking at **their own** page, and only if there is something
to show: a section with nothing in it is left out.

1. **Assigned to you**: open tasks across every ministry, overdue first, each with its
   ministry and due date, and the open run of any routine you are working. You can tick a
   task off here. Link: *All my lists*.
2. **My lists**: the lists, routines and runs you can see in each ministry you serve in,
   by ministry, with the same cards as the ministry's page. Managing stays on that page.
3. **My teaching**: the messages that name you as speaker, with Edit. Link: *My teaching*.
4. **Ministry budgets**: budgets shared with the ministries you serve in, linking to the
   Ministry budget page. No amounts on this page.
5. A **Edit my profile** button to `/profile`.

### How "only the owner" is enforced

The member page's own endpoint (`GET /api/people/:id`) carries **nothing private**. The
owner's sections are fetched by the browser from endpoints that already answer only for
the signed-in person (`/api/me/lists`, `/api/teaching/mine`, `/api/stewardship/ministries`),
and only when the page is the viewer's own. So there is no way to ask for someone else's
tasks by changing the address, because those endpoints do not take a person.

Staff and administrators see no private sections on anyone's page, including as a
convenience. The page being someone else's is the whole test.

These sections are fetched in the browser only, so they are not in the page's HTML.
The service worker's offline copies cover Welcome Home, the directory, the calendar and
ministries; `/people/*` and these endpoints are not among them, and are not added.

## Accounts with no person

An account only becomes a church member's page once it is connected to a person in the
directory (`people.userId`, set by staff in Accounts). Until then `/me` says so plainly:
"Your sign-in is not connected to a person in the church directory yet. Ask the church
office." It does not guess a match by name or email.

In the dev database none of the real accounts is connected, so this state is the first
thing they would see; see the dev notes in the ministry lists work.

## API sketch

```
GET /api/people/:id     members only. The person as the viewer may see them,
                        isSelf, ministries (visible ones), speaker messages (visible ones).
                        404 for a minor the viewer may not see, never 403.
GET /api/me/person      the viewer's own person id, or null if the account is unconnected.
```

No new tables.

## UI

Nuxt UI components throughout. A header with the name, title and photo; sections below
as cards; the owner's sections under a heading ("Just for you") so it is clear what
other people do not see. The tile and menu entry follow the existing patterns in
`app/pages/members.vue` and `app/layouts/default.vue`.

## Tests

The privacy rules are the risk, so they get the most:

- A matrix of viewer (self, another member, staff, an account without the member role,
  signed out) × person (shares everything, shares nothing, minor, guest speaker,
  hides one ministry) asserting exactly which fields come back.
- A member and a staff member opening a minor's page: 404 for the member.
- The speaker's messages respect message visibility: a members-only message is listed to
  members, and a draft to no one.
- `/me` with and without a connected person.
- The endpoint returns no field belonging to the private sections for any viewer.

## Phasing

1. **The page and the entry points**: `/people/[id]`, `/me`, the tile, the menu entry
   and links from the directory and speakers. This is useful on its own.
2. **The owner's sections.** These reuse existing endpoints and the list cards already built.

## Open questions

1. **The address.** `/people/[id]`, or another name you prefer?
2. **Staff and minors.** Staff see minors in the directory today, so the page would show a
   minor's page to staff, as the directory does. Confirm, or hide minors from staff here.
3. **Ticking a task off from your own page** is allowed (the same check as the ministry's
   page). Confirm, or make it read-only with a link out.

## Decided while building

- **The household rule is in the shared privacy code, not the page.** `presentPerson`
  (`shared/privacy.ts`) now lets the adults of a household see its minors, so the
  directory and the ministry rosters follow the same rule as the page. A parent sees their
  child in the directory and on a roster where the child is shown, not only on the child's page.
- **"Adults of the household" means every adult role, not only father, mother and guardian.**
  A married couple is stored as *husband* and *wife*, and the household's `relationship`
  says whether they are the children's parents or guardians; a single parent or guardians
  are *father/mother/guardian*. Only `child` is excluded, so a grown child does not see
  their minor siblings on that account alone. (The first version listed only father, mother
  and guardian and would have shut a wife out of her own child's page.)
- **What a carer sees of the minor is what any member sees of an adult:** name, title,
  and only the details the minor has shared. No private fields.
- **Staff means anyone holding `people:viewContact`, administrators included.** They see
  minors and contact details here exactly as in the directory.
- **Ministry cards:** the name links to the person's page, stretched over the whole
  card. Only a signed-in member sees the roster, so every card on it is a page the viewer
  may open; the public roster has no links.
- **Guests** have a page only while they are on the Speakers list.
- **The directory card's name links to the page** (members and speakers). The Teaching
  pages' speaker names are *not* linked: that data is shown to visitors, and a link to a
  members-only page would be a dead end for them.
- **`/my-lists` and the member page share one component** for assigned tasks and lists.
