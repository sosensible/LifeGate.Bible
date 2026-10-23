# Spec: Photos of people and households

Status: **built 2026-10-23; not committed or deployed.**

## What it is

A current photo for each person and each household, set by **staff**. Members never
upload a photo: not their own, not their children's.

## Who may do what

| | Person's photo | Household's photo |
|---|---|---|
| **Set, replace, remove** | Staff (`people:update`), **at any time**. | Staff (`people:update`), at any time. |
| **See it** | The person always (to look at it before deciding). Staff who set photos always (in the people admin). Any other member only once the person has turned on **Photo with everyone**. | Staff always; members of that household; any member who can already see the household, which is to say someone in it has shared their household. |
| **Decide who sees it** | The person, on `/profile` (or staff on their behalf, with `people:managePrivacy`). | Nobody: it follows the household's own sharing. |

A minor's photo follows the minor rule: other members never see it; the household's
adults and staff do, once it is shared.

This replaces an earlier draft in which staff could upload only *after* the person had
shared their photo. That gate was dropped: hiding is the sharing flag's job, not the
upload's. Staff upload any time; nothing reaches another member until the person agrees.

## Where the files live

- In the **uploads folder beside the database**: `.data/uploads` in development,
  `/app/.data/uploads` on the ZimaOS bind mount in the container (`UPLOADS_PATH`
  overrides). So **never in git** (`.data` is in `.gitignore`), **never in a Docker image**
  (`.data` is in `.dockerignore`), and **never in the public folder**. The one backup of
  the data directory covers them with the database.
- The database holds only the address that serves a file, `/api/photos/<random-name>`
  (`people.photo_url`, `households.photo_url`). Only the current photo is kept: replacing or
  removing one deletes the old file, and so does deleting the person or household.
- Files are checked by their contents (JPEG, PNG or WebP, up to 5 MB), not their names.

## Who may be sent the file

Every request to `/api/photos/<name>` must be **signed in**, **come from a page of this
site** and pass the **same privacy rules as the page that shows it**
(`presentPerson`, so a photo can never be fetched by address when the page would not show
it). Anything refused is a 404, which confirms nothing.

- *From this site:* the browser's `Sec-Fetch-Site` must be `same-origin`; a browser that
  sends none is judged by its `Referer`. Another site cannot embed a photo, and a link
  pasted elsewhere or an address typed in shows nothing. The response also carries
  `Cross-Origin-Resource-Policy: same-origin`. The missions photos got the same check.
- Responses are `private` and not cached by shared caches (the API answers `no-store`).

## Setting a photo (the screens)

- **People admin → a person → Photo.** Upload, replace, remove. It says plainly whether
  the photo is shared yet and tells staff the person can look at it on their own page
  before deciding.
- **Households admin → a household → Photo.**
- **Before it is sent**, the browser draws the photo onto a canvas and uploads that. This
  turns it the right way up, **removes every hidden detail, including where it was
  taken**, and makes it small (1200 px longest side), so a phone's 5 MB original is never
  refused. If the browser cannot read the file, nothing is sent.

## Where it shows

- The person's photo: their member page header, directory cards and ministry rosters, as
  the privacy rules allow. On `/profile` the person sees it with the **Photo** switch and
  an explanation, and in the preview of how others see them.
- The household's photo: beside the household name on a member's page, only where the
  household itself is shown.

## Decisions and limits

- **Metadata stripping is done in the browser, not the server.** The server cannot rotate
  pixels without an image library, and removing the rotation tag would turn phone photos
  sideways. A hand-made upload straight to the API, by staff, could keep its location data.
- No cropping tool and no history of past photos.
- A guest speaker's record can have a photo like anyone's; it goes when the record does.
