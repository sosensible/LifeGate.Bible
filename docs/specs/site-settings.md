# Spec: Church details (name, address, logo and the rest)

Status: **built 2026-10-23; not committed or deployed.** One open question remains (service times; see the end).
Owner: John · Target: this site (Nuxt 4 + Nuxt UI v4)

## Goal

The church's name, address, logo, phone, contact email and service times are typed into
the code today. Make them editable by the office, in one place, and have every page,
email and icon follow.

## Decisions already made

| Question | Decision |
|---|---|
| Who may edit | **Administrators and the church secretary.** |
| What is editable | Name, **short name**, a **one-line description**, address, **phone**, **contact email**, **service times**, and the **logo**. |
| How far the logo reaches | **Everywhere it appears**: header, home page, login, emails, the browser tab, and the phone home-screen icon. |
| Privacy policy and terms | **Follow the settings**: the sentences that name the church and where it is. |
| Shipped defaults | **Neutral.** The code is reused by other churches, so the seed, the placeholder mark and the statement seed name nobody. Our name, address, times and crest are *data*, entered through the same page (kept outside git in `.data/brand/`). |
| Email sender | The display name follows the church name; the address stays configured (`MAIL_FROM_ADDRESS`). |
| Offline page | Keeps working: built with the placeholder, it asks for the church's own name and logo once running and the service worker answers from what it kept. |
| Get Directions | Wired to the street address (a map search); hidden until there is a street. |

## What is hard-coded today (what changes)

- **The name**: about 48 files. Mostly each page's title (`… | Lifegate Baptist Church`), plus
  the footer, the home page, the privacy and terms text, the email header, the sender's
  display name, and the phone app's name (`nuxt.config.ts`, fixed at build time).
- **The address**: the footer and the home page (twice), the legal pages, and the description
  search engines show. The *About* page's wording is the church's own official copy, set in
  prose, and is **not** touched.
- **Service times, phone, email**: typed into `app/pages/index.vue`; the contact email is
  also the server's `CONTACT_EMAIL`.
- **The logo**: the crest in three sizes and two formats for the page, favicons, an iPhone
  icon, and Android icons, all built files; the service worker stores the crest at build
  time so the offline page has one.

## What is *not* part of this

- **Giving statements.** The Treasurer already keeps the church's *legal* name, mailing
  address, EIN and signer for statements (`statement_settings`, in Stewardship). That is a
  legal and financial record with its own owner; it stays separate, and administrators do
  not see it. Changing the site name does not change a statement.
- The About page copy, the Seeking Pastor page, and other page content.
- The site's web address (`lifegate.bible`), which stays configuration, not a setting.

## The settings

One row, `site_settings` (id `site`). Seeded by the migration with **today's values**, so
nothing changes on the day it deploys.

| Setting | Notes |
|---|---|
| `name` | "Lifegate Baptist Church". Required, up to 80 characters. |
| `shortName` | "Lifegate". Under the icon on a phone; short on purpose (a warning past 12). |
| `description` | One line, up to 160 characters. Shown by search engines. |
| `street`, `city`, `region`, `postalCode` | Parts, not a block of text, so pages can show "Eau Claire, Michigan 49111" or the full address. The street is blank today. |
| `phone` | Optional, shown as given. |
| `contactEmail` | Where the Contact page's messages go, and what the footer shows. |
| `serviceTimes` | Up to eight rows: day ("Sun"), label ("Sunday School"), time ("10:00 AM"), note ("All Ages"). |
| `logoVersion` | `0` = the built-in crest; otherwise the version of the uploaded set. |

Contact email is the one with consequences: it decides where the public contact form's
messages are sent. A change is recorded in the audit log (which field changed, never the
value), like every other edit. It overrides `CONTACT_EMAIL`, which remains the fallback.

## Where it shows

A public read, `GET /api/site`, carries only what is already public on the site. A
`useSite()` composable reads it during server rendering, so the first page a visitor gets
is already right.

- **Page titles**: one `titleTemplate` in `app.vue` (`<page> | <name>`). The pages stop
  repeating the name; this is the mechanical part, about 45 files.
- **Footer, home page, login, error and offline pages**: name, address, phone, email, times.
- **Privacy policy and terms**: name and city come from the settings.
- **Emails**: the header name, and the sender's display name (the address stays configured).
- **The phone app**: the manifest becomes a server route built from the settings (name,
  short name, description, icons) instead of a build-time file. The install title meta tag
  follows the short name.
- **Search engines**: the description meta tag.

## The logo

Uploaded once, by an administrator or the church secretary, as a single picture. **The
browser makes every size from it** (the site has no image library, and a canvas does this
well): the page sizes (216, 432, 864 wide, in proportion), and square icons (16, 32, 48, 180
for iPhone on an opaque background, 192 and 512 for Android) centred on a transparent
background. The picture is shown before it is saved. The browser sends the whole set; the
server checks that each file really is a PNG of the size it claims, and stores them.

- **Storage:** beside the database, like photos (`.data/uploads/site/<version>/`): never in
  git, never in a Docker image. The database holds only the version number.
- **Serving:** `/site/logo/<size>.png` and `/site/icon/<size>.png`, public (the logo is on
  every page), cached for a year because the address carries the version, so a new logo
  shows at once. `/favicon.ico` follows.
- **Until a logo is uploaded**, and if the files are ever missing, the built-in crest is
  served: the site never has a broken image.
- **Replacing** deletes the previous set. **Removing** goes back to the built-in crest.
- **Offline.** The service worker stores the logo files it is asked for as it goes, instead
  of at build time, so the offline page keeps its crest. The offline page itself is built
  ahead of time and shows the built-in crest until the site is next deployed.
- **Limits worth knowing:** a phone that already installed the app keeps its old
  home-screen icon until it is reinstalled, and browsers hold on to a tab icon for a while.
  A 1.5 MB original is shrunk before it is sent.

## Who may edit

A new permission, `siteSettings: ['update']`, given to **administrators** and the **church
secretary**. Reading is public. The page is `/admin/site` ("Church details"), in the
account menu for those who may edit. Every change goes through the audit log.

## API sketch

```
GET /api/site                    public: name, shortName, description, address, phone,
                                 contactEmail, serviceTimes, logoVersion
PUT /api/admin/site              siteSettings:update: the text settings
PUT /api/admin/site/logo         siteSettings:update: the set of PNGs (multipart)
DELETE /api/admin/site/logo      siteSettings:update: back to the built-in crest
GET /site/logo/[size].png        public, cached for a year
GET /site/icon/[size].png        public
GET /manifest.webmanifest        public, built from the settings
```

## Phasing

1. **The details.** `site_settings`, the permission, the admin page, `GET /api/site`,
   `useSite()`, the title template, footer, home page, legal pages, emails and the manifest's
   text. Safe to ship first: nothing visibly changes until someone edits.
2. **The logo.** Upload, the browser-made sizes, serving, `SiteLogo`, the icon links, the
   manifest's icons and the service worker's runtime caching.

## Tests

- The settings read, validation, and that the seed equals today's values.
- The permission: administrators and the church secretary may update; every other role,
  and a signed-out request, may not; reading is public.
- The manifest and title template reflect an edit; the mail header and sender name follow.
- The contact form sends to the edited address, falling back to `CONTACT_EMAIL`.
- Logo: a file that is not a PNG, or not the size it claims, is refused and nothing is
  stored; replacing deletes the old set; removing falls back to the built-in crest; a missing
  file falls back too; nothing is written inside the repository.
- The service worker no longer lists the logo files in its build-time precache, and caches
  `/site/*` as it goes.

## Decided while building

- **Seeded neutral.** Migration 0022 seeds "Your Church Name"; `loadSite()` never throws and falls back to the same neutral defaults, so a build with no database still renders.
- **The manifest is a route** (`/manifest.webmanifest`), not a build-time file; `pwa.manifest` is off.
- **Logo files are checked by header** (a real PNG signature and IHDR of the stated size), size-limited, and served with `nosniff`; the browser re-draws the picture, which drops hidden details.
- **The logo is not precached.** The worker keeps `/site/*` and `/api/site` as first fetched (caches without the `lifegate-offline-` prefix, so a sign-out does not empty them).
- **Version = seconds since 1970**, always greater than the last, so a removed-then-uploaded logo never reuses a cached address.
- **Pages stopped repeating the name** in titles; one `titleTemplate` adds it. Page prose that is the church's own (About, Seeking Pastor, hero wording, the ministries) is not a setting and is unchanged.

## Open questions (original; answered)

All three were answered yes. The new question is below.

1. **The sender's display name** in emails will follow the church name. The address stays
   in configuration. OK?
2. **The offline page** keeps the built-in crest until the next deploy. Acceptable, or
   should it be made to show the edited logo whenever it has already been loaded once?
3. **A "Get Directions" button** on the home page exists today; with a street address it
   could open a map search for the address. Do you want that wired to the address?

## Service times and the calendar (decided 2026-10-23)

Calendar first, the typed times as the fallback, and typed services also appear on the church calendar.

- A service is a **weekday, a time (24-hour), a name, a note and a "Show on the calendar" box** (a calendar icon heads that column). It used to be free text; it has to be real data for the calendar to repeat it.
- **Home page** (`GET /api/site/services`, public): for each typed service, the next occurrence on the Google calendar **whose title matches the service's name** (case ignored). A service moved to another hour or day shows its new time, with the date and "(changed)"; a cancelled week is absent from the feed, so the next one shows. With no match, or if the calendar cannot be read, the typed day and time show.
- **Church calendar page** (`/api/calendar`): a ticked service is listed **every week for a year**, in the church's time zone (stays 11:00 across daylight saving), one hour long, with the church address as its place, **unless the Google calendar already has an event of that name**, so a service is never listed twice. The Google calendar is the source of truth once it has the service; the box is for services it lacks.
- Not done: a typed service that the Google calendar has only partly (its series ended) is not topped up from the typed times.
- The Google calendar is public at Google; this makes the next services visible on the public home page. Its current titles ("Sunday School", "Sunday Service", "Prayer Meeting") are the names to use.
