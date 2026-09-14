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
  - Birthday (month and day only), household and photo: only if shared, staff included.
- **`/directory`**: `GET /api/directory` returns each entry already filtered for the viewer.
- **`/ministries`**: names and descriptions are public; rosters come from the server only for members.
- **`/profile`**: a person edits their own phone, email, address, birthday and sharing, with a live preview of what members and staff see.
- **`/admin/people`** (`people:update`):
  - add, edit and remove people (`people:create` and `people:delete` for those two); manage households and ministries;
  - change sharing on someone's behalf (`people:managePrivacy`);
  - give sign-in access by linking an account, or creating a member account and emailing a set-password link (`user:create`).
  - Nobody edits what they cannot see: staff cannot set or change a birthday (or, later, a photo) until the person shares it. Titles are a separate field shown beside the name, never part of it.
- **Audit log**: every change records who, what and which fields, never the values.
- **Dev data**: `npm run db:migrate`, then `npm run db:seed-demo -- <account email> <first name>` adds fictional people to an empty local database and optionally links an account.

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
