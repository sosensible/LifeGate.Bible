# Spec: Notifications (channels, a log, and push)

Status: **phase 1 built 2026-10-24** (channels, sending, the log, task notices, message settings); not committed or deployed. Phase 2 (push to devices) is not built.
Owner: John · Target: this site (Nuxt 4 + Nuxt UI v4), installed app and browser

## Goal

Ministry leaders can send short messages to the members of their ministry. A
ministry can have one or more **channels** (for example "Schedule changes" and
"Prayer requests"). Members see what they could receive, choose which channels they
follow, and read a **log of recent notifications** in the member area. Where a
member has allowed it on a device, a notification is also **pushed** to that device,
even when the site is not open.

Three parts, in this order of value:

1. **Channels and the log.** Works for everyone, on every device, with no
   permission needed.
2. **Push to a device.** Adds the phone or computer nudge.
3. **System notices.** Tasks assigned and due, and office announcements, through
   the same channels.

It adds a way to reach members. It replaces nothing: email stays as it is.

## Decisions already made

| Question | Decision |
|---|---|
| Who sends | **Any ministry leader**, to the members of **their** ministry. Leadership comes from the roster, as for ministry lists, so a new leader gets it and the old one loses it |
| Channels | **A ministry can have one or more.** Leaders add, rename and retire them |
| What members see | A place to review **what they might receive**: the channels open to them, with a switch on each |
| After sign-out | **Notifications keep arriving on that device** until someone else signs in on it. Decided: a notification is only text and gives the person holding the device no ability to act. Tapping it still goes through sign-in. Someone signed in on a shared device can do things; a notification cannot |
| One person per device | **At most one user receives push on a device.** A new sign-in on a device blocks the previous person's push there |
| A record | A **log of recent notifications** for signed-in members, shown in a friendly screen, as a tab on the member page |

## What push is, in plain terms

1. A person presses a button, once per device, to allow notifications.
2. Their browser gives the site a private delivery address for that device. The
   address belongs to Google, Mozilla or Apple, depending on the browser. We keep it.
3. When something is sent, our server sends it to that address, encrypted from our
   server to the device. The delivery service carries it but cannot read it; it does
   learn that a message was sent.
4. The browser wakes the site's service worker, which shows the notification. Tapping
   it opens a page on the site.

This is the standard Web Push system (the Push API, the Notifications API and VAPID
keys). No third-party account or fee is involved.

### Where it works

| Device | Needs |
|---|---|
| Android Chrome, desktop Chrome, Edge, Firefox | Works in an ordinary browser tab. Installing is not required |
| Mac Safari (macOS 13 or later) | Works in the browser |
| iPhone and iPad (iOS 16.4 or later) | **Only after the site is added to the Home Screen.** A plain Safari tab cannot receive push messages |

This is why the log comes first and push second. A member on an iPhone who has not
installed the app gets no push, but still sees everything in the log. The install
dialog (release 1.2.0) is the way to fix that, and the notifications screen must
say so.

## Cost

**Running it costs nothing extra.** There is no fee per message or per person.

- The delivery services (Google, Mozilla, Apple) carry web push for free, with no
  account, API key or sign-up on our side. The VAPID keys are made on our own server.
- iPhone web push does **not** need an Apple Developer membership. That fee (about
  $99 a year) applies to native iPhone apps in the App Store, not to an installed
  website.
- The sending library (`web-push`) is open source.
- A few hundred small messages is a negligible load on the server.

What it does cost is **our time to build and look after it**. Email is a separate
cost (Cloudflare email sending, already in use); push does not add to it.

This describes how these services are priced as I know them; it has not been checked
against each provider's current terms. Worth a look before launch.

## Channels

A channel is a named stream of messages that belongs to a ministry (later, also to
the church as a whole).

| Field | Notes |
|---|---|
| `ministry` | The ministry it belongs to. Empty for a church-wide channel (phase 3) |
| `name` | "Schedule changes". Up to 40 characters |
| `description` | One line saying what it is for, shown to members choosing what to follow |
| `archived` | A retired channel keeps its history but takes no new messages |

- **Every ministry starts with one channel, "General".** Leaders can add more, rename
  them, and retire them.
- **Who follows what.** A member follows a channel to receive its messages in their
  log and, where they have allowed it, on a device. Members **can see only the
  channels of ministries they serve in** (plus church-wide ones). The roster decides:
  someone who leaves a ministry stops receiving its channels and can no longer read
  its past messages in their log.
- **Default.** Members of a ministry follow its channels from the start, and can turn
  any off. *(Open question 1.)*

## Sending

Any leader of a ministry can send to any of its channels, from the ministry's page.

- **The form:** channel, a **title** (up to 60 characters), a **message** (up to 200),
  and, optionally, a **page on this site** to open when it is tapped (the ministry's
  page by default). No outside links.
- **Reminder on the form, every time:** "This can appear on someone's lock screen,
  including after they have signed out of the app. Do not include private details,
  names of children, or anything about missionaries."
- **Recipients:** the people who follow the channel **and are on the ministry's
  roster at the moment of sending**. Checked then, not when they followed.
- **After sending**, the leader sees the message in the ministry's sent list with
  **how many** it reached and how many have read it. **Never who**, the same
  privacy rule as the audit log.
- **Limits:** a leader may send at most a handful per channel a day (open question 3),
  so a channel cannot be used to nag.
- **Audit:** who sent it, to which channel, when, and how many people. Not the text.

## The member's log

A **Notifications** tab on the member's own page (`/me`, which opens their page).
It is private to the signed-in person. Staff, administrators and leaders see
nothing of anyone else's.

**Recent**
- The latest notifications, newest first, grouped by day: the channel and ministry,
  the title and message, and the time.
- Unread ones are marked; the tab shows a count. Opening one marks it read and goes
  to its page. "Mark all read".
- Friendly empty state: "Nothing yet. Messages from your ministries will appear here."
- **Kept 90 days** (open question 2).
- **The log only shows what the person may still see.** If they have left the
  ministry since, its messages are hidden from their log. Never let someone read what
  they can no longer see.

**What you receive**
- The channels open to the person, **grouped by ministry**, each with its
  description and a switch. This is where they review what they might receive.
- **This device:** whether push is on here. A button to turn it on (the browser
  asks once), with plain words if the browser has blocked it, since a site cannot ask
  again. On an iPhone that has not installed the app, it says why push is not
  available and opens the install dialog. Turning push off here keeps the person's
  channel choices.
- **Other devices:** the person's other devices with push on, each with Remove.

A badge on the tab (and, later, the app icon where the device supports it) shows the
unread count.

## One person per device, and sign-out

This replaces the earlier rule that push stops at sign-out.

- **A device's push belongs to one person.** The delivery address is stored once, against
  one user. It cannot be shared.
- **Signing out does not stop notifications.** The device keeps receiving the last
  person's notifications until someone else signs in on it. Nothing is removed at
  sign-out.
- **A new person signing in blocks the previous person on that device.** After
  signing in, the site checks whether the device holds push belonging to someone else.
  If so, it **removes** that person's push on this device. They receive nothing more
  there, but their channel choices and their log are untouched, and they get push back
  on that device by turning it on again after they sign in. The new person starts with
  push **off** on the device and turns it on with one tap (the browser's permission is
  already granted, so no second prompt). Nobody is subscribed without pressing the
  button.
- **Signing out says what will happen:** "Notifications will keep arriving on this
  device until someone else signs in here. Turn them off first if you share this
  device." with a "Turn off notifications on this device" choice.
- **Tapping a notification when signed out** opens the sign-in page and then goes to
  the page it pointed to.

**Why this is acceptable (decided).** A notification is read-only text. It gives
whoever is holding the device no ability to *do* anything: tapping it opens the
sign-in page, and the page's own access checks apply once someone signs in. A person
who is signed in on a shared device can act on the site; a notification cannot. What
remains is that someone could **read** the text as it arrives. Because leaders write
the text, it cannot be guaranteed generic, so the safeguards stay: the reminder on the
send form, the length limits, the sign-out notice, and a one-tap way to stop
notifications on a device. A person who loses a phone can remove it from another
device.

## Rules that cannot be bent

1. **Opt-in on a device.** Nothing is pushed to a device until the person presses the
   button there. Following a channel, by default, only fills the log.
2. **The log is private to the person.** Not readable by anyone else, however senior.
3. **Roster decides.** Sending, following and reading all re-check the roster at the
   moment they happen, so a leader who is replaced stops sending and a member who
   leaves stops receiving and reading.
4. **No private content from the system.** Notices the site writes itself (phase 3)
   say what happened, not the detail: "You have a new task in Nursery". Nothing about
   minors, missionaries, giving or other private information.
5. **Internal links only.** A notification may open a page on this site and nowhere
   else, and tapping a notification re-checks the person's access like any page load.
6. **One person per device.** As above.

## Setup (once per deployment)

A pair of VAPID keys identifies the server to the delivery services.

| Setting | Notes |
|---|---|
| `VAPID_PRIVATE_KEY` | Secret. In the container's environment, never in git. Different for staging and production |
| `VAPID_PUBLIC_KEY` | Not secret. Sent to the browser |
| `VAPID_SUBJECT` | A `mailto:` address the delivery service can reach. Taken from the church's contact email in Church details unless set |

If the keys are missing, **push** switches itself off (the device button is hidden and
nothing is pushed). Channels and the log keep working. Keys are made once with
`npx web-push generate-vapid-keys` and added to the app definition like the other
secrets. **Changing the keys later invalidates every existing subscription.**

## Data

New tables (all with `ON DELETE cascade` from the thing they belong to):

| Table | Holds |
|---|---|
| `notification_channels` | `id`, `ministry_id` (null = church-wide), `name`, `description`, `archived_at` |
| `channel_follows` | `user_id`, `channel_id`, whether it is followed. One row per person and channel; only the person's own rows are readable by them |
| `notifications` | `id`, `channel_id`, `sender_user_id`, `title`, `body`, `url`, `created_at` |
| `notification_receipts` | `notification_id`, `user_id`, `read_at`, `pushed_at`, `push_failed`. Created at send time for each recipient |
| `push_subscriptions` | `id`, `user_id`, `endpoint` (**unique**), `p256dh`, `auth`, `label` ("iPhone, Safari"), `created_at`, `last_sent_at`, `failures` |

A delivery service answering "gone" (404 or 410) means the permission was removed or
the device is lost: that subscription is deleted at once, and repeated failures delete it.
Messages and receipts are deleted after the retention period.

## How it is built

- **Server.** `server/lib/notifications.ts` holds the rules (who may send, who is a
  recipient, what a person may read) as plain functions, tested on their own, in the
  way `server/lib/ministry-lists.ts` is. `server/lib/push.ts` uses `web-push`, a
  proven library with no hand-written encryption. Sending never blocks or fails the
  action that caused it.
- **Routes (sketch):**
  - `GET/POST/PATCH /api/ministries/:slug/channels`: list, add, rename or retire
    channels (leaders change; members read).
  - `POST /api/ministries/:slug/channels/:id/send`: leaders only.
  - `GET /api/ministries/:slug/notifications`: a leader's sent list, with counts.
  - `GET /api/me/notifications`, `POST /api/me/notifications/read`: the person's own log.
  - `GET /api/me/channels`, `PUT /api/me/channels/:id`: channels open to the person,
    and following or not.
  - `GET/PUT/DELETE /api/me/push`, `POST /api/me/push/claim`: this person's devices;
    `claim` is how a new sign-in blocks the previous person.
  All require sign-in and act only on the signed-in person.
- **Service worker.** Two small handlers in `app/service-worker/sw.ts`: `push` (show it,
  with the church's icon) and `notificationclick` (open or focus the site at its page,
  same-origin only). The existing caching is untouched. **The log and channel
  endpoints must stay out of the offline copies** (as with ministry lists), because
  what a person may read changes when their roster does.
- **Screens.** The Notifications tab on `/me` (Nuxt UI tabs, switches, badges). A
  Notifications section on a ministry's page for its leaders: channels, the send form,
  and the sent list.
- **Quiet hours.** Nothing is *pushed* between 9 p.m. and 7 a.m. church time; it waits
  until morning. The log is unaffected. (Open question 5.)

## Email and push together

Task assignments already email. A person with push on for the "My tasks" notices
(phase 3) gets the push as well; whether the email also stays is open question 7.

## Tests

- **Roster rules:** a leader sends to their ministry's channels and nobody else's; a
  replaced leader cannot send; a member who has left receives nothing and cannot read
  the past messages; someone who is not on the roster cannot follow its channels.
- **The log:** a person reads only their own; other people, including staff and
  administrators, cannot; messages from a ministry they have left are hidden.
- **Opt-in:** following a channel pushes nothing; push needs a stored device opt-in;
  nothing is pushed when the keys are missing, though the log still fills.
- **One person per device:** an endpoint belongs to one person; a new sign-in's claim
  removes the previous person's push on that device and leaves their choices and log;
  signing out removes nothing; the previous person receives nothing after the claim.
- **Subscriptions:** one person's devices cannot be read or removed by another; a
  "gone" answer deletes the row; repeated failures delete it.
- **Send limits and content:** length limits, daily limit per channel, and links
  outside the site are refused.
- **Counts only:** a leader sees how many received and read, never who.
- **Quiet hours:** a push in the window is held; the log is not.
- **Service worker:** the push handler shows a notification from a minimal payload;
  the click handler opens only same-origin addresses; the log and channel endpoints
  are never stored offline.

The delivery services cannot be reached from the test suite, so sending is tested
against a fake. A real send to a real device is a hand test on staging.

## Phasing

1. **Channels, sending and the log.** Tables, ministry channels (with "General"),
   the leader's send form and sent list, the member's Notifications tab with the
   follow switches. No push yet. Useful to everyone, including iPhone members who have
   not installed the app.
2. **Push.** Keys, devices, the service worker handlers, one person per device,
   quiet hours.
3. **System notices.** Tasks assigned and due soon through a built-in "My tasks"
   channel, and church-wide announcements from the office (open question 4).

## Decided, 2026-10-24

The open questions were answered and phase 1 was built on these:

| Question | Decision |
|---|---|
| Default for following | **Members of a ministry follow its channels from the start** and can mute any. Stored as mutes (`channel_mutes`), so "follow" is the absence of a row |
| How long to keep the log | **90 days, a global setting** (Church details, Messages), and that is the default |
| Messages per day per channel | **A global setting, default 5**, under Messages. Counted per channel, by the church's calendar day |
| Order of messages | **A minimum gap between messages on a channel, a global setting, default 30 seconds** (0 turns it off). A send inside the gap is refused with how many seconds to wait. Same-second messages are also ordered by when they were stored |
| Quiet hours | **A global setting**, like the logo, default 9 p.m. to 7 a.m. church time. Stored and editable now; takes effect when push exists |
| Church-wide announcements | **A list of chosen members with accounts**, kept in the global settings. Church-wide channels are kept there too |
| Task assignments | **Emailed, messaged, or both.** The ministry has a default (starts as both), its leaders can change it, and a list of tasks can choose differently. A routine's choice is copied into its runs of tasks |
| The iPhone install requirement | **Acceptable** |
| Notifications after sign-out | **They keep arriving.** A notification is only text and gives no ability to act; tapping it goes through sign-in |

## What phase 1 does (built)

- **Channels.** Every ministry has "General"; leaders add, rename and retire more.
  The church has "Church announcements", kept on the Church details page.
- **Sending.** A ministry's leaders send from the ministry's page; chosen announcers
  send to the church from their own Notifications tab. Title up to 60 characters,
  message up to 200, an optional page on this site from a short list, and a reminder
  about lock screens every time.
- **The log.** A second tab in the personal part of the member's own page ("Just for
  you"), beside "Waiting for you": **Notifications** (`/me?tab=notifications`). It is a
  second place to read what was sent to you, in case an alert was missed. Recent
  (unread marked, mark all read) and What you receive (a switch for each channel,
  grouped by ministry). Messages from a ministry someone has left are hidden. Other
  people's pages have no such tab.
- **Leaders' view.** How many a message reached and how many have read it, never who.
- **Tasks.** Giving someone a task tells them as the list or ministry chose. The
  notice says a task was given, never what it is. Nobody is told of a task they gave
  themselves, and a person with no account cannot be told.
- **Settings** (Church details, Messages): messages per channel per day, how long to
  keep them, quiet hours, who may announce to the church, the church-wide channels.
- Nothing about notifications is stored for offline reading. A person's log and a
  ministry's channels are never in the service worker's caches.

## Who can be told

A person with no account cannot be sent a task notice or any message. Rather than warn
only afterwards:

- **Marked where it matters.** In the form that gives out a task, each person on the
  roster has a bell (can be told) or a crossed-out bell (no account, so tell them
  yourself), with a legend.
- **Told after the fact too.** Saving a task for someone who cannot be told shows the
  leader a warning, since they may not have looked at the marks.
- **A list for leaders.** "Who can receive messages" on the ministry's Notifications:
  everyone listed on the roster, marked the same way, with "N of M people here have an
  account". People who chose not to be listed are counted but not named, as everywhere.
- Leaders only. Members are never sent who has an account.

## What phase 1 does not do

- No alerts to phones or computers yet: no keys, no device subscriptions, no service
  worker handlers. Quiet hours are stored for when they exist.
- A person with no account receives nothing. A task for someone with an account but
  no email on file is announced by message only.
- No count on the account menu or app icon yet; the tab shows the unread count.

## Still open

1. **Church-wide announcers can send from their Notifications tab only.** Is that the
   right place, or should the office have a page of its own?
2. ~~Task notices to people with no account~~ Decided: marked, and the leader is
   told (see "Who can be told").
