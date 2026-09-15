# Handoff: Lifegate Baptist Church Portal

## Overview

This is a full-stack church member portal built with **Nuxt 4** and **Cloudflare D1 (SQLite)**, deployed on Cloudflare Pages. The design includes authentication, sermon library, member directory (admin), giving/donations, contact forms, and pastoral candidate applications. All backend endpoints are functional and wired to Cloudflare Email Service for notifications.

## About the Design Files

The bundled files are **production-ready HTML/Vue prototypes** that form the working application. This is not a mockup — the pages, API routes, and database schema are live and can be iterated directly or migrated to another framework. The task is to:

1. **Continue backend development** (file uploads, payment processing, email refinements)
2. **Polish UI/UX** (animations, responsive mobile, accessibility)
3. **Set up deployment** (domain configuration, email onboarding, secrets management)
4. **Add administrative features** (application review dashboard, analytics, bulk communications)

## Fidelity

**High-fidelity (hifi)**: Pixel-perfect designs with final colors (#1A5C30 green, #2A1A0E brown, #C4993C gold), typography (Playfair Display serif, Lato sans), and interactions. All CSS is inline; no external stylesheets. The designs follow the church's established visual language from the marketing site.

## Architecture

### Tech Stack
- **Framework**: Nuxt 4 (Vue 3)
- **Backend**: Nitro (server routes)
- **Database**: Cloudflare D1 (SQLite)
- **Hosting**: Cloudflare Pages + Workers
- **Email**: Cloudflare Email Service
- **UI Library**: Nuxt UI (for buttons, forms, modals)
- **Fonts**: Google Fonts (Playfair Display, Lato)

### Project Structure
```
app/
  pages/
    index.vue                    # Landing/main portal
    login.vue                    # Auth
    teaching/                    # Sermon archive and single message pages
    admin/sermons.vue            # Sermon and series management
    giving.vue                   # Donations
    contact.vue                  # Contact form
    pastoral-candidates.vue      # Job applications
    directory.vue                # Members directory (server-filtered by privacy)
    profile.vue                  # My profile: own details + sharing choices
    admin/
      people.vue                 # People and households (church office)
  middleware/
    auth.ts                      # Auth guard
  layouts/
    default.vue                  # Main layout

server/
  routes/
    auth/
      login.ts                   # POST /auth/login
      logout.ts                  # POST /auth/logout
    api/
      directory.get.ts           # GET /api/directory (members)
      ministries/                # GET /api/ministries, /api/ministries/[slug]
      profile.get.ts / .patch.ts # GET/PATCH /api/profile (own record)
      admin/people/              # people CRUD, privacy, sign-in access
      admin/households/          # household CRUD
      sermons/                   # GET /api/sermons, /api/sermons/[slug], .../thumbnail
      admin/sermons/             # sermon CRUD + YouTube lookup
      admin/sermon-series/       # series CRUD
      giving.ts                  # POST /api/giving (donations)
      contact.ts                 # POST /api/contact (contact form)
      pastoral-candidates.ts     # POST /api/pastoral-candidates (job apps)
  utils/
    auth.ts                      # requireAuth() helper
    email.ts                     # sendEmail() + email templates
  middleware/
    admin-auth.ts                # Admin role check

db/
  schema.sql                     # Database schema (users, members, sermons, gifts, etc.)

nuxt.config.ts                   # Cloudflare bindings (D1, EMAIL)
```

## Screens / Views

### 1. Landing / Home (`/`)
- **Purpose**: Public homepage, login button, service times
- **Auth state**: Shows different nav for logged-in vs. logged-out users
- **Key elements**:
  - Hero section (dark green #294231 background)
  - Service times bar (#4f272e burgundy)
  - Quick links for "Plan Your Visit" and "Member Login"
  - Responsive grid layout

### 2. Login (`/login`)
- **Purpose**: Member authentication via invite code + password
- **Fields**: Email, password, invite code
- **Behavior**: 
  - Validates against D1 `users` table
  - Sets `auth_token` cookie
  - Redirects to `/` (landing) on success
- **Error handling**: Invalid credentials, expired codes

### 3. Teaching (`/teaching`, `/teaching/[slug]`, `/admin/sermons`)

Sermons live in SQLite (`sermons`, `sermon_series`). Video is stored as provider +
id; today the only provider is YouTube (unlisted is fine).

- **Who sees what** (`server/lib/sermons.ts`):
  - public + published: everyone;
  - members + published: members only (and people who manage sermons);
  - drafts: only people with `sermon:update`.
  - Signed-out visitors get a count of members-only messages, never their titles or video ids.
- **`/teaching`**: latest message with player, the archive with search and filters (series, book, topic, dates). Filters can come from the link, e.g. `/teaching?series=Gospel%20of%20John`.
- **`/teaching/[slug]`**: one message. Members-only sends signed-out visitors to sign in; drafts are 404 to everyone else. Slugs are set once from date and title and never change.
- **Privacy**: the player is Nuxt Scripts' `ScriptYouTubePlayer`, which uses `youtube-nocookie.com` and loads nothing from YouTube until someone presses play. Thumbnails come from `/api/sermons/[slug]/thumbnail`, which checks access and caches YouTube's image, so no Google request happens on page load and members-only video ids never reach the public.
- **`/admin/sermons`**:
  - add, edit and remove messages (`sermon:create`, `sermon:update`, `sermon:delete`); manage series.
  - Publishing or unpublishing needs `sermon:publish`; others save drafts.
  - "Check" confirms a YouTube link through YouTube's oEmbed endpoint and offers its title.
- **Teachers** edit their own messages. In the sermon form the speaker is picked from the directory's Speakers list, which links the message to that person (`sermons.speakerPersonId`); a guest's name can still be typed without a link. Migration 0016 linked existing messages whose speaker matched exactly one person on the list.
  - A signed-in account whose person is a message's linked speaker gets **My teaching** (`/my-teaching`) and an **Edit your message** button on `/teaching/[slug]`, including drafts, which they can also open.
  - They may change the title, date, series (existing ones), passage, books, topics and notes (`teacherSermonSchema`, `PATCH /api/teaching/mine/[id]`). The video, speaker, who can watch and publishing are refused, not ignored. Audit entries are `sermon.update` noted "By its teacher".
- Audit log: `sermon.create`, `sermon.update`, `sermon.publish`, `sermon.unpublish`, `sermon.delete`, `series.*`.
- Not yet: audio files, PDF notes, live stream.

### 4. Giving (`/giving`)
- **Purpose**: One-time, monthly, and pledge donations
- **Options**:
  - One-time gift
  - Monthly sustaining gift (auto-renew toggle)
  - Capital campaign pledge
- **Form fields**:
  - Amount (quick-select buttons: $25, $50, $100, $250, or custom)
  - Donor name, email, phone
  - Fund designation (General, Missions, Youth, Building, Other)
  - Special notes
- **Email notifications**:
  - Thank you email to donor via Cloudflare Email Service
  - Admin notification to `info@lifegate.bible`
- **Next step**: Integrate Stripe/payment processor; currently logs to D1 and generates checkout URL placeholder

### 5. Contact (`/contact`)
- **Purpose**: General inquiries, prayer requests, event questions
- **Form fields**:
  - Name, email, phone, subject (dropdown: General/Prayer/Event/Membership/Ministry/Other)
  - Message textarea
- **Email notifications**:
  - Confirmation to sender
  - Admin alert to `info@lifegate.bible`
- **Storage**: D1 `contact_messages` table

### 6. Pastoral Candidates (`/pastoral-candidates`)
- **Purpose**: Job applications for open positions (Associate Pastor, Worship Pastor)
- **Features**:
  - Display active positions with descriptions, requirements, responsibilities
  - Application form with file upload (resume/CV)
  - References field
- **Form fields**:
  - First/last name, email, phone
  - Years of ministry experience, education, ministry statement
  - Resume file upload
  - References (3+)
  - Agreement checkbox
- **Storage**: D1 `pastoral_applications` table
- **TODO**: Store resume file to R2 or local storage; send confirmation emails

### 7. Directory, profile and people admin

Data lives in SQLite (`server/database/schema/app.ts`): `people`, `households`,
`ministries`, `ministry_members`, `audit_log`. A person is a directory record,
not an account; an account can be linked to one person.

- **Privacy rules** (`shared/privacy.ts`, enforced on the server):
  - Members see adults' names, titles and ministries. Minors are never listed to members.
  - Phone, email and address: staff (`people:viewContact`) always; members only if the person shares them.
  - Birthday (month and day only), household and photo: only if shared, staff included. "Everyone" in the sharing labels means everyone signed in to the members area, never the public.
- **`/directory`**: `GET /api/directory` returns each entry already filtered for the viewer, in two lists:
  - **Members**: church members only;
  - **Speakers** (`/directory?tab=speakers`): people marked as speakers, each labeled Member or Guest speaker. Their contact details follow the same sharing rules, so a speaker's contact shows only if they choose to share it.
    - `speakers:update` (content editor, staff, admin) adds a guest speaker or a church member, edits guest speakers (a member's details stay on their profile) and archives.
    - `speakers:delete` (pastor, directory manager, admin) sees the archive, restores, and removes permanently: a guest's record is deleted; a member simply stops being a speaker.
- **Guests** (`people.kind = 'guest'`, e.g. guest speakers) are kept as records but are not in the members list, ministry rosters or households.
- **`/ministries`**: names and descriptions are public. Rosters list church members who serve, leaders first (marked by the office under People), by each person's own choice per ministry (`ministry_members`):
  - **members** see them unless they opt out on `/profile` (default on); an opted-out ministry is also left off their directory entry, for staff too;
  - **the public** sees them only if they opt in (default off), and only while members see them too: name, title and leader badge only (never a photo, birthday or contact details). Minors are never shown publicly. There is no public directory.
  - Staff still see every assignment under People, with a note when someone has opted out or in.
- **`/admin/ministries`** (`ministry:update`: church secretary, content editors and admins): add ministries, edit names and descriptions, and remove ones nobody serves in and no budget is shared with (`server/lib/ministries.ts`). A ministry's web address is set from its first name and kept on rename. The Missions ministry can be renamed but not removed, because it decides who edits the Missions pages. Audit: `ministry.create`, `ministry.update`, `ministry.delete`.
- **`/profile`**: a person edits their own phone, email, address, birthday and sharing, and chooses per ministry whether members and everyone see them on its roster, with a live preview of what members and staff see.
- **`/admin/people`** (`people:update`):
  - add, edit and remove people (`people:create` and `people:delete` for those two); assign ministries;
  - manage households (`shared/households.ts`), which record who runs the house and whether they are the children's family or guardians:
    - a married couple (husband and wife) who are father and mother, or guardians (e.g. foster care); children optional;
    - a single adult who is the children's father, mother or guardian; at least one child;
    - two guardians (any two adults, e.g. grandparents); at least one child.
    - A single adult with no children is not a household. Children are simply listed.
    - Names are generated from the adults' first names in alphabetical order plus the husband's last name (or, otherwise, the first-listed adult's), e.g. "James & Sarah Mitchell Household", and can be replaced with a custom name.
    - Households are listed by last name, then first names. A person belongs to at most one household.
    - Households that do not meet the rules are flagged "Needs setup".
  - change sharing on someone's behalf (`people:managePrivacy`);
  - give sign-in access by linking an account, or creating a member account and emailing a set-password link (`user:create`).
  - Nobody edits what they cannot see: staff cannot set or change a birthday (or, later, a photo) until the person shares it. Titles are a separate field shown beside the name, never part of it.
- **Audit log**: every change records who, what and which fields, never the values.
- **Dev data**: `npm run db:migrate`, then `npm run db:seed-demo -- <account email> <first name>` adds fictional people to an empty local database and optionally links an account.

### 8. Missions (`/missions`, `/missions/[slug]`, `/missions/organizations/[slug]`)

Members only, and not indexed by search engines. Some countries make being known as a missionary dangerous. The Missions ministry page links here for members.

- **Entries**: mission organizations, and missionary families or individuals, each with a photo, write-up, field, focus, organization, status, start year, support link, next visit to Lifegate, and prayer requests and letters.
- **Contact details** (email, phone, website, mailing address) reach members only when `shareContact` is on; editors always see them.
- **Editors**: roles with `missions:update` (pastor, directory manager, admin), plus anyone whose directory entry serves in the Missions ministry (`server/lib/missions.ts`, `server/utils/auth.ts`).
- **Photos** (`server/lib/uploads.ts`):
  - stored outside the public folder (`UPLOADS_PATH`, default `uploads/` beside the database) and served only to members;
  - accepted only as JPEG, PNG or WebP, judged by file contents, up to 5 MB;
  - previewed before saving, and deleted when replaced or removed.
- **Archive**: "Remove" archives an entry, hiding it from members. Archived entries are 404 for everyone except staff and admins (`missions:delete`: pastor, directory manager, admin), who get a collapsed Archived section on `/missions` to restore entries or remove them permanently, and a banner with Restore on an archived entry's page. Only archived entries can be removed permanently. A missionary keeps an organization that was archived after it was chosen, but members no longer see it named.
- Every change is in the audit log.

### 9. Accounts and audit log (`/admin/accounts`, `/admin/audit`)

- **Accounts** (`user:list`):
  - create accounts (always email-verified; optional set-password email);
  - assign roles, block and unblock, email a password link, sign out everywhere, delete.
  - Roles are defined in `shared/auth/permissions.ts`; the page describes each one (`shared/auth/role-info.ts`).
- **Safeguards** (`server/lib/accounts.ts`): nobody can block, delete or remove the administrator role from their own account, and the last active administrator cannot be demoted, blocked or deleted.
- Better Auth's own `/api/auth/admin/*` endpoints return 404 over HTTP, so every account change goes through these guarded, audited routes.
- **Audit log** (`audit:view`): filter by item type, action, person and dates, optionally hiding sign-ins. Entries show names, which fields changed and a note (e.g. `member → member, admin`), never personal values.
- **Sign-ins** are recorded from Better Auth's session hook.
- **Magic links and passwords:** Better Auth deletes the password of an account whose email is unverified the first time it signs in with a magic link. Accounts created here are marked verified, completing a password reset marks the email verified, and migration `0004` marks existing accounts verified. See `tests/unit/magic-link.spec.ts`.

### 10. Stewardship (`/admin/stewardship/*`, `/ministry-budget`)

The church's accounts, transactions and budget (Phase 1), offerings with year-end giving statements (Phase 2), and semi-annual reports (Phase 3).

- **Who** (`shared/auth/permissions.ts`, resource `stewardship`):
  - **Treasurer** (`view`, `manage`) keeps it.
  - **Finance committee** (`view`) reads it.
  - **Pastor, deacon, church secretary** (`grantAccess`) decide what each ministry sees, and see no amounts.
  - **Admins get nothing financial**, like pastoral applications.
- **Money** is integer cents (`shared/money.ts`). Forms use Nuxt UI's `UInputNumber` through `AdminMoneyInput`.
- **Budget** (`server/lib/budget.ts`):
  - Only cash accounts (checking, savings, cash) count. Their combined balance is what categories are funded from.
  - **Available to Fund** = cash − every category's Remaining − uncategorized transactions.
  - Each category shows Funded, Activity and Remaining per month.
  - Set per category: **rollover** keeps what is left; **reset** returns it (or the overspending) to Available to Fund at month end.
  - Transfers between the church's accounts are not activity. Income that is not for a particular category goes to the system category Available to Fund.
- **Bank data** (`server/lib/simplefin*.ts`):
  - SimpleFIN Bridge, read-only. Run `npm run simplefin:claim -- <setup token>` and put the printed URL in `SIMPLEFIN_ACCESS_URL`; it is never stored in the database.
  - The Nitro scheduled task `stewardship:sync` runs at 05:00, 11:00, 17:00 and 23:00. "Check the bank" is limited to once every 30 minutes.
  - The first sync reads 90 days; later ones start a week before the last good sync. Pending transactions are skipped, and re-reads never duplicate (unique per account + SimpleFIN id).
  - Payee rules fill in payee and category for new transactions.
  - Manual accounts (e.g. the cash box) take hand-entered transactions; bank accounts do not.
- **Privacy**:
  - The bank's description reaches only `manage`.
  - For anyone else, a sensitive category's transactions (e.g. Benevolence) show the category name instead of the payee.
  - Ministries can see a sensitive category's totals only.
  - Audit entries name accounts, categories and months, never amounts or payees.
- **Ministry budgets** (`server/lib/stewardship-access.ts`):
  - A grant gives one ministry `totals` or `ledger` on one category, for its leaders or everyone serving in it.
  - Access comes from the directory (`people.userId` → `ministry_members`), not a role.
  - Leaders open `/ministry-budget` from the account menu. The Treasurer and Finance Committee can open any ministry that has grants.
- **Plans** (`server/lib/plan-math.ts`, `server/lib/plans.ts`):
  - Each category can have one plan: **fill up to** or **add** an amount, **monthly** or **by a date**.
  - A dated plan can repeat monthly, quarterly or yearly.
    - **By the month:** the money must be in before the due month starts.
    - **By the date:** the due month counts.
  - A repeating plan asks again the month after it is due, dividing what is still needed by the months left.
  - A plan can instead be built **from recurring bills**: weekly and monthly bills are needed in the month they fall due, and quarterly or yearly bills are spread evenly until due.
  - Dated plans need a rollover category.
  - The Budget page shows each plan's status and what it still needs. **Fund plans** previews, then funds, in budget order until Available to Fund runs out. Nothing is funded automatically.
- **Recurring transactions** (`server/lib/recurring.ts`, `server/lib/schedule.ts`):
  - Each one can be any mix of:
    - a reminder
    - feeding its category's plan
    - **matching bank transactions**: new imports within ±5 days of an open due date, with the same amount (or within 25% when it varies) and the match text, get its category and payee before payee rules run
    - **entering automatically** in a manual account, from the daily `stewardship:recurring` task at 06:00
  - Handled occurrences (paid, entered, skipped) are stored, so nothing is matched or entered twice.
  - They are listed on Transactions → Recurring, and in the budget's Activity popup.
- **Scripture** in the Stewardship header rotates through `shared/stewardship-verses.ts` (KJV). Add verses there.
- **Offerings** (`/admin/stewardship/offerings`, `server/lib/giving.ts`, resource `giving`):
  - **Who:** the **Treasurer** has `record`, `view` and `manage`. A **Counter** has `record` only: they start counts, enter gifts in open counts, search givers by name and add a new giver by name. Counters never see closed counts, giving history, totals by giver or addresses. Nobody else has `giving`: not admins, pastors, deacons or the finance committee.
  - **Counts:** one per offering, with the cash and check totals from the paper count sheet. A gift has a giver (or none, for loose cash), a method (cash, check, online, bank transfer, other) and an amount, optionally split into designated lines. It is dated with the count unless given its own date, e.g. a check mailed by December 31. A count closes only when its cash and checks match the sheet; reopening needs a reason, kept in the count's notes.
  - **Undesignated by default:** a gift is just an amount, and goes to Available to Fund for budgeting. A gift given for something in particular is **designated** to a budget category (e.g. Missions); there is no separate list of funds. When the category alone doesn't say what a designated gift is for, a **memo** records it (e.g. "VBS snacks"); the memo stays with the gift and is not copied to the deposit's budget lines, which ministries can see. Counters choose from spending categories in use, by name only. A category with designated gifts can be archived, not removed.
  - After a count is closed, **Link deposit** splits the matching bank deposit (exact total, within a week, not yet categorized): undesignated giving to Available to Fund, designated gifts to their categories. It can instead record the deposit in a manual cash account. The deposit's lines name categories, never givers. Linking needs `stewardship:manage` too.
- **Giving records** (`/admin/stewardship/givers`): usually a household. The name, mailing address and email are the Treasurer's own, not copied from the directory; linking to a household or person only offers its name. Removing that directory record leaves the giving record. A record with gifts can be archived, not removed.
- **Statements** (`/admin/stewardship/statements`, `server/lib/statements.ts`, `server/lib/statement-pdf.ts`):
  - A giver's gifts on **closed** counts, received in the year, with undesignated and designated subtotals (the "Given to" column appears only when something was designated) and the IRS wording, which is fixed in `shared/giving.ts`. Loose cash is never on a statement. Open counts in the year are flagged.
  - PDFs are rendered with pdfmake using the standard PDF fonts (nothing loaded from disk or network). **Preview** opens one; **Print mailed statements** makes one PDF of everyone who gets theirs by mail; **Email statements** sends each emailed giver their own PDF.
  - Every print or email is recorded, and a statement whose total changed since it went out is flagged so a corrected one can be sent.
  - Church name, address, EIN, signer and closing message are in **Statement settings**.
  - Audit entries say "Giving record" and give counts ("12 sent, 1 failed"), never names, amounts or email addresses.
- **Reports** (`/admin/stewardship/reports`, `server/lib/reports.ts`, `server/lib/report-pdf.ts`), for `stewardship:view`:
  - January–June and July–December. Category figures come from the budget itself (`monthView`), so a report always agrees with the Budget page. Each category shows Carried in, Funded, Activity, Returned (what a reset category gave back to Available to Fund; shown only when non-zero) and Remaining, with group and grand totals.
  - Each category group is set (Categories → edit group) to report **each category** or the **group total only**, e.g. staff pay. A total-only group is one line on screen, in the PDF and in the CSV, and the transaction CSV shows its lines under the group name with no category, payee or memo. The Budget page is unchanged.
  - A cash summary opens the report: cash at start, undesignated and designated offerings (lines of deposits linked to counts), other money in, money out, transfers to or from accounts outside the budget, not yet categorized, cash at end, and Available to Fund at start and end. It reconciles to the cent.
  - **PDF** (pdfmake, shared setup in `server/lib/pdf.ts`) shows totals only. **CSV** (papaparse, formula-escaped) adds month-by-month activity; **CSV with transactions** lists every line, with sensitive categories showing the category name instead of the payee and no memo, and never bank wording.
  - No period lock: reports reflect current data. Downloads are recorded in the audit log as `report.export` with the period only.
- Tests: `budget.spec.ts`, `plans.spec.ts`, `recurring.spec.ts`, `simplefin.spec.ts`, `stewardship-access.spec.ts`, `giving.spec.ts`, `statements.spec.ts`, `reports.spec.ts`, `mail.spec.ts`, `permissions.spec.ts`.

## Database Schema

### `users`
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  auth_token TEXT UNIQUE,
  role TEXT DEFAULT 'member',  -- member, deacon, elder, pastor, admin
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `members`
```sql
CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  user_id INTEGER FOREIGN KEY,
  role TEXT DEFAULT 'member',
  family_unit TEXT,
  phone TEXT,
  address TEXT,
  birthday TEXT,
  ministries TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `sermons`
```sql
CREATE TABLE sermons (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  speaker TEXT,
  date TEXT,
  video_url TEXT,
  audio_url TEXT,
  pdf_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `gifts`
```sql
CREATE TABLE gifts (
  id INTEGER PRIMARY KEY,
  amount REAL NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  fund TEXT DEFAULT 'general',
  notes TEXT,
  type TEXT DEFAULT 'onetime',  -- onetime, monthly, pledge
  auto_renew INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `contact_messages`
```sql
CREATE TABLE contact_messages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `pastoral_applications`
```sql
CREATE TABLE pastoral_applications (
  id INTEGER PRIMARY KEY,
  position_id INTEGER,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  years_experience INTEGER,
  education TEXT NOT NULL,
  statement TEXT NOT NULL,
  references TEXT,
  status TEXT DEFAULT 'pending',  -- pending, under_review, rejected, accepted
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Interactions & Behavior

### Authentication Flow
1. User visits `/` → sees public landing
2. Clicks "Member Login" → redirected to `/login`
3. Enters email, password, invite code
4. Backend validates against D1; checks `auth_token` exists
5. On success: sets `auth_token` cookie, redirects to `/`
6. On failure: displays error message, clears form
7. Auth middleware (`app/middleware/auth.ts`) protects `/admin/*` routes — redirects non-admins to `/`

### Donation Flow
1. User selects giving option (one-time, monthly, pledge)
2. Fills form: amount, donor info, fund designation
3. Submits → `POST /api/giving`
4. Backend:
   - Stores to D1 `gifts` table
   - Sends thank-you email to donor
   - Sends admin notification to `info@lifegate.bible`
   - Returns checkout URL (TODO: Stripe integration)
5. User redirected to payment processor (currently placeholder)

### Contact Form Flow
1. User fills contact form (name, email, subject, message)
2. Submits → `POST /api/contact`
3. Backend:
   - Stores to D1 `contact_messages` table
   - Sends confirmation email to user
   - Sends admin notification
4. Success message shown; form clears

### Adding a sermon (Admin)
1. Upload the video to YouTube as Unlisted (or Public), with embedding allowed.
2. Account menu → Sermons → Add message; paste the Share link and press Check.
3. Fill in date, speaker, passage, books and topics; choose Members only or Everyone.
4. Save as a draft, or turn on Published (needs `sermon:publish`).

## Design Tokens

### Colors
- **Primary Green**: `#1A5C30` (buttons, accents)
- **Dark Green**: `#294231` (header/hero background)
- **Burgundy**: `#4f272e` (service times bar), `#7B1828` (button alt)
- **Gold**: `#C4993C` (section labels, highlights)
- **Dark Brown**: `#2A1A0E` (headings, text)
- **Medium Brown**: `#5C4230` (body text)
- **Light Brown**: `#8C7050` (muted text), `#DBC0BC` (very light)
- **Beige**: `#ebe6d2` (hero background), `#f5f0e8` (light sections)
- **White/Off-white**: `#FAF8F0`, `#F5EDCF` (backgrounds)

### Typography
- **Serif (Display)**: Playfair Display
  - Headings: 28–70px, weight 600–700
  - h1: 70px, #2A1A0E
  - h2: 28px, #2A1A0E
  - h3: 20–24px, #2A1A0E
- **Sans-serif (Body)**: Lato
  - Body text: 14–17px, weight 400, #5C4230
  - Labels: 12–14px, weight 600–700, #5C4230
  - Small text: 12px, weight 400, #8C7050

### Spacing
- **Gap/Margin standard**: 12px, 16px, 24px, 28px, 32px, 36px
- **Padding on cards**: 24–32px
- **Section padding**: 32–96px vertical, 36px horizontal

### Shadows
- Light: `0 2px 10px rgba(0,0,0,.22)`
- Hover: `0 2px 10px rgba(0,0,0,.22)` (same, more pronounced on interaction)

### Border Radius
- Input/buttons: 3–4px
- Cards: 4px (rounded)

## Assets

- **Logo**: `uploads/logo-1782244256168.png` (church logo, ~56px height on nav)
- **Fonts**: Google Fonts (Playfair Display, Lato) — loaded via `@nuxtjs/google-fonts` in `nuxt.config.ts`
- **No external imagery** — use placeholders in design, rely on user-provided content for sermons/team photos

## Email Templates

### Contact Confirmation (Sender)
```
Subject: We received your message: [subject]
---
Dear [name],

Thank you for contacting Lifegate Baptist Church. We've received your message and will be in touch shortly.

[quote of message content]

Best regards,
Lifegate Baptist Church
info@lifegate.bible
```

### Contact Admin Notification
```
Subject: New Contact Form: [subject]
---
[Full contact details + message]
```

### Gift Thank-You (Donor)
```
Subject: Thank You for Your Gift
---
Dear [firstName],

Thank you for your generous gift of $[amount] to our [fund] fund. Your contribution will make a meaningful difference in our ministry. You will receive a formal tax receipt via mail shortly.

Blessings,
Lifegate Baptist Church
```

### Gift Admin Notification
```
Subject: New Gift Received: $[amount]
---
Donor: [firstName] [lastName]
Amount: $[amount]
Fund: [fund]
Email: [email]
```

## Current State & TODOs

### ✅ Complete
- Auth system (D1 + invite codes)
- Sermon upload endpoint (form UI)
- Member directory (admin search/add)
- Giving/donation flow (email notifications)
- Contact form (email notifications)
- Pastoral candidate applications (form + DB storage)
- Cloudflare Email Service integration

### 🔄 In Progress
- Sermon file storage (currently form-only, need R2 or CDN upload)
- Pastoral candidate file handling (resume storage)
- Payment processing integration (Stripe placeholder)

### 📋 TODO
- **Admin Dashboard**:
  - Review/manage pastoral applications (status, notes, reject/accept)
  - View contact form submissions
  - View donation history + analytics
  - Manage sermons (edit/delete)
- **Mobile Responsive**:
  - Test all pages on 375px, 768px, 1920px viewports
  - Hamburger nav for mobile
- **Accessibility**:
  - ARIA labels, keyboard nav, color contrast
  - Screen reader testing
- **Error Handling**:
  - Better error messages (email validation, file size limits)
  - Retry logic for failed email sends
- **Security**:
  - CSRF protection
  - Rate limiting on forms
  - Input sanitization
- **Performance**:
  - Lazy-load sermon videos
  - Image optimization
  - Caching strategy for D1 queries
- **Domain Setup**:
  - Point `lifegate.bible` domain to Cloudflare Pages
  - Onboard domain in Cloudflare Email Sending dashboard
  - Configure SPF/DKIM/DMARC for `info@lifegate.bible`

## Deployment

### Prerequisites
1. Cloudflare account with Pages enabled
2. `lifegate.bible` domain on Cloudflare DNS
3. D1 database created (`lifegate_db`)
4. Email Service enabled and domain onboarded

### Steps
1. Push to GitHub (or deploy via Wrangler)
2. Link repo to Cloudflare Pages in dashboard
3. Set build command: `npm run build`
4. Set publish directory: `.output/public`
5. Add environment variables:
   - `CLOUDFLARE_D1_BINDING=lifegate_db`
   - `CLOUDFLARE_EMAIL_BINDING=EMAIL`
6. Configure custom domain
7. Test auth, forms, and email notifications in production

## Files Reference

- `app/pages/` — All Vue page components
- `server/routes/` — API endpoints and auth
- `server/utils/email.ts` — Email helper + templates
- `nuxt.config.ts` — Cloudflare bindings + Nuxt config
- `package.json` — Dependencies (Nuxt, Nuxt UI, Google Fonts)

---

**Last Updated**: January 2025  
**Status**: Production-ready with backend TODOs  
**Contact**: info@lifegate.bible
