# Spec: Church video copy

Status: **built 2026-11-02; not committed or deployed. Needs a Bunny account to try for real.**
Owner: John · Target: this site (Nuxt 4 + Nuxt UI v4)

## Goal

A message can keep its own copy of its video on the church's video host (Bunny Stream)
next to a YouTube link, so the share controls (docs/specs/sermon-sharing.md) can actually
stop a paused or members-only message from being watched.

## Decisions already made

| Question | Decision |
|---|---|
| Host | **Bunny Stream.** About $2–3 a month at this size; Stream (Cloudflare) was about $30. Self-hosting through the tunnel was ruled out (Cloudflare CDN terms). |
| Both sources | A message may carry a YouTube video, a hosted copy, or both. The player uses the hosted copy **once it is ready**, otherwise YouTube. A copy still processing or failed never hides a working YouTube video. |
| Who may watch | The server gives a **signed play link (1 hour)** only to someone who may watch the message, and only when the viewer presses play. A pause stops new plays at once. A link already open lasts up to an hour. |
| YouTube | Unchanged. A YouTube link cannot be recalled once shared, so a pause hides the page but not a link someone already has. |
| Live streaming | **Not this app.** That is the separate soStream product, to connect later to optimize the recorded copy. |
| Archive | None. At Bunny's prices keeping every message on demand costs a few dollars a month. |

## How it works

- `sermons.hosted_video_id` and `hosted_video_state` (`processing` | `ready` | `failed`). Migration 0027.
- `server/lib/bunny.ts`: the connection (from `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_TOKEN_KEY`), the play-link and upload signatures, the host calls.
- `server/lib/hosted-video.ts`: start, remove and refresh a copy.
- Routes: `POST`, `GET`, `DELETE /api/admin/sermons/:id/hosted-video` (permission `sermon.update`), `GET /api/admin/sermons/hosted-video` (is a host connected), `GET /api/sermons/:slug/playback` (the signed link).
- Uploads go **from the browser straight to the host** (resumable, signed by the server). The file never passes through this server or the tunnel.
- The host's video id is never sent to a browser; screens only learn the state.
- Deleting a message removes its hosted copy from the host.

## The volunteer workflow

- **One form.** In Add message the volunteer chooses or drops the video file. The title (and the date, if the file name starts with one such as `2026-11-01_The Good Shepherd.mp4`) fill in from the file name. When the message is saved, the upload starts in the background; the form can close.
- **Progress stays visible.** The Teaching list shows "Uploading 40%", then "Getting ready", then "Ready" for each message. The upload carries on while the site stays open, resumes if the connection drops, and warns before the tab is closed.
- **Publish when ready.** A switch on a draft message publishes it as soon as the video host finishes preparing the video, even with nobody on the page. The publication is recorded in the audit log in the name of who asked. Needs the right to publish.
- **A scheduled check** (`hosted-video:refresh`, every 2 minutes) finds copies still being prepared and finishes them; it does nothing until a video host is connected. Migration 0028.
- **Replace and remove** are on the same screen.

## Advertising

A hosted copy plays in the video host's own player, with no advertising or third-party injection in its feature set. YouTube cannot make that promise for an embedded video (its player may show ads, overlays or suggested videos). The player prefers the hosted copy once it is ready; YouTube only plays while a hosted copy is still being prepared, or on messages that have none.

## Posting to YouTube

- The church connects **its own YouTube channel** once, from Church details → Video, by signing in to Google and approving two things only: uploading videos and reading the channel's name (`youtube.upload`, `youtube.readonly`). Needs `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`. Migration 0029.
- The refresh token is kept **encrypted** (AES-256-GCM, keyed from `BETTER_AUTH_SECRET`), never shown, and revoked and deleted on disconnect. The sign-in state is signed and expires in ten minutes.
- A video chosen in the message form can also go to YouTube, **unlisted**. The browser sends the file **straight to YouTube** (the server only starts the upload and returns its address), so nothing passes through the tunnel. A dropped connection resumes from what YouTube already has.
- The video id the browser reports is attached to the message only if it is **really on the church's channel**.
- A message can go to the video host, YouTube, or both, one after the other.
- Google's documentation says videos uploaded by an unaudited API project (created after 28 July 2020) are locked to Private, so YouTube copies may arrive private until the project passes the API compliance audit. The Help page says so. Also not verified against Google: whether unverified projects can upload unlisted today, whether the sign-in needs Google's review for these scopes, and whether the app must be in production to avoid a 7-day expiry (Google's docs say Testing mode expires after 7 days).

## A copy on the church server (steps 1 to 5 built)

- **Model.** The church server holds the **master copy**; the video host and YouTube are distribution. Chosen on Church details → Video (an Admin only): a folder, checked for write access and free space. Env fallback `LOCAL_VIDEO_PATH`. Off until a folder is set.
- **Upload.** The volunteer's browser sends the file **once** to the server, resumable (tus) in **50 MB pieces** so each request stays under Cloudflare's per-request limit. The upload address needs the right to edit teaching, and the signed-in person is read from the session cookie on every request.
- **Filing.** Pieces land in `<folder>/.incoming`, are checksummed (SHA-256), then moved to `<folder>/<year>/<slug>-<short id>/original.<ext>`. The database (`sermon_files`, migration 0031) keeps the path **relative to the folder**, the size and the checksum, so the folder can be moved later. A new upload replaces the old file. Pieces of uploads nobody finished are removed from `.incoming` once untouched for two days (daily task `local-files:sweep`).
- **Refused up front:** not signed in, no such message, an empty file, or no room (free space under 110% of the file).
- **Removal.** Removing a copy, or deleting a message, deletes the file. Removing a copy needs the right to remove teaching.
- **Checked:** a 130 MB upload, in three pieces, through the built server with a signed-in administrator arrived with matching size and checksum, and a signed-out upload was refused.
- **Cloudflare:** the upload goes through the tunnel. It is an upload, not serving video to viewers, but Cloudflare's terms do not say so explicitly. On the church's own network it does not leave the building.

**Step 2, sending to the video host from the server (built).** When a video is filed and a video host is connected, the site queues a send and starts it in the background; the volunteer does not wait. It streams the stored file to the host in resumable 50 MB pieces, signed as the host checks. Each message has one record (`video_pushes`, migration 0032) saying queued, sending, sent or failed, the attempts, the last reason, and the checksum sent, so a replaced file is sent again and an unchanged one is not.
- A new copy replaces the message's hosted copy **only once the whole file has arrived**; a failed send removes the half-made copy and leaves a working one alone. A message deleted mid-send has what was sent removed.
- Failures retry with growing gaps: 1, 2, 4, 8 minutes, up to an hour, **8 tries**, then it waits for **Send now**. A send that says it is sending but has not moved for 3 hours is taken as dead and retried. A scheduled task (`video-pushes:run`, every minute) does the retrying, and only **one send runs at a time**.
- "Publish as soon as the video is ready" can be asked for while the send is still on its way.
- With a local folder on, the **browser no longer sends to the host itself**; it only sends to the church server (and, until step 3, to YouTube).
- Checked: against a stand-in host that verifies the real upload signatures, and end to end through the built server (keys entered through the settings route, a 60 MB upload, sent on by itself, checksum matching, host finished, keys never sent back).
- The stored file is **never played from the church server**; members watch from the video host or YouTube.

**Step 3, sending to YouTube from the server (built).** If the volunteer chose "Also post to YouTube" and the channel is connected, the server posts the stored file to the church's channel in the background, as **unlisted**, with the same queue, retries (1 minute up to an hour, 8 tries), one-at-a-time rule and **Send now** as the video host. The file streams from disk in one resumable request; if the connection drops it asks YouTube how much arrived and sends only the rest. Afterwards the video is **confirmed to be on the church's channel** before the message is pointed at it. A message that already had a YouTube link has it replaced (the earlier video stays on the channel, since the site may only upload). With no video-host copy to wait for, a draft that asked to publish when ready is published as soon as YouTube has it. A place that is not connected is left waiting, not failed.
- With a local folder on, the browser sends **only** to the church server; the server does the rest. The browser still sends to YouTube itself when no folder is chosen.
- Changing Google's keys ends the YouTube connection; saving the **same** value again changes nothing.
- Checked: a stand-in Google (sign-in, lookup) and a real local resumable upload address that drops the connection; and end to end through the built server (60 MB, unlisted, bearer from the saved refresh token, checksum matching, no send when YouTube was not asked for, no secrets sent back).

**Step 4, bringing a copy in from the video host (built).** For a message whose video is on the host but not on the church server, an Admin-entered **delivery hostname** (Church details → Video, field `bunny.cdnHost`) lets the server fetch the **original** from `https://<hostname>/<video id>/original`.
- The host is asked first (`hasOriginal`, and the original's SHA-256 `originalHash`). If it no longer holds the original (**Keep original files** was off at upload) the pull fails with that reason; it cannot be recovered.
- The request is signed like the host's delivery addresses with token authentication (HMAC-SHA256 of the path and expiry, key = the library's token key) and sent with the site as referrer, so allowed-domain rules are met. The download streams to the holding folder, is checked against the host's checksum and the advertised size, has room confirmed first, and is then filed exactly like an upload. A mismatch keeps nothing.
- Same queue as sending: retries 1 minute up to an hour, 8 tries, one at a time, **Try now**. The stored copy is not sent back to the host it came from.
- **Cannot** bring a video in from YouTube, which does not give the original back; the form says so.
- Built from the docs, with one gap: the docs do not say how to learn the hostname from the API, so it is entered once; and the signing rule for the original is the documented delivery-address rule, not yet tried against a live library.
- Checked: unit tests against a stand-in host; and end to end through the built server (60 MB from a stand-in that refuses anything not correctly signed, checksum matching the host's, referrer sent, guards for no hostname / no host copy / already stored).

**Step 5, moving where the copies are kept (built).** Three things.
- **Changing the folder.** Church details → Video → Copy on the church server → **Move the stored videos**. Every video is copied into the new folder and its checksum checked; only when all are safely there does the site switch (one step), and then the old files and emptied folders are removed. **The old folder stays the one in use, and untouched, until then**; any failure (a damaged source file, no room, a dropped disk) leaves it exactly as it was, and the move can be retried (files already copied and checked are not copied again) or given up (the copies in the new folder are removed). The move shows as running until the old files are cleared; a restart carries on (`folder-move:run`, every minute). While it runs, new uploads, removals and copies brought in from the host are refused, so nothing is written to the old folder behind its back. Refused up front: the same folder, one inside the other, a folder the server cannot write to, not enough room. Migration 0033 (`folder_moves`).
- **The folder cannot be changed behind the videos' backs.** While videos are stored, saving a different folder in the settings is refused unless it already holds every stored video (so re-pointing at the same data after turning the folder off still works). Videos are recorded by path *relative* to the folder, so a checked move changes no records.
- **Keep only on the video host.** In a message's form: removes the church server's copy **only after the host is shown to hold the very same original** (it says it holds one, its checksum equals the stored file's, and its copy is finished). If it cannot be asked, has no original, has a different one, or gives no checksum, nothing is removed. Plain **Remove local copy** is still there, now with a stronger confirmation that it may be the last copy.
- **Send everything again to a new place.** After connecting a new video library or channel: one button per place queues every stored video afresh. The usual rules apply (one at a time, retries, a new copy replaces the old only once it has fully arrived).
- Checked: unit tests against real folders (damaged file, resume, cancel, nesting, no room), and end to end through the built server (a 90 MB video moved, checksum matching, uploads refused during the move, the old folder cleared, the settings guard, the release refused with no video host).

**Step 6, shared broadcasts (built).** A locked page on this site, `/watch/<name>`, for a stream that comes from elsewhere (soStream). This app decides **who may open it and how many**; it does not carry the stream. Managed by those with the right to schedule live meetings (`liveMeeting.manage`), at **Shared broadcasts**. Migration 0034 (`broadcasts`, `broadcast_passes`, `broadcast_seats`).
- **Members** watch with no code. **Guests** (only on a broadcast set to admit them) need a **code made for one person**: ten unambiguous letters, shown once, kept only as a hash. The **first browser** to use a code is remembered (a hash in the database, a secret in an httpOnly cookie); any other browser is turned away, so one code is one person on one device. **New code** replaces it and unbinds the device; **Turn off** ends it and gives its seat back. Wrong guesses are limited (8 per 10 minutes per place, in memory).
- **The limit** counts people **let in in total**, members and guests together, a member taking a seat just as a guest does (a member needs no code, but the limit still holds). A person keeps their seat once they have one; **Give all places back** clears them. It counts people admitted, not people watching at this moment.
- Open only while the switch is on and the dates allow; after "Ends at" it shows as ended.
- The stream's address is sent to a browser **only after** the person is let in, and may carry `{viewer}`, replaced by an opaque per-person id so soStream can tell viewers apart. **The gate is on our page: anyone who has the stream's address could open it directly**, so the stream's own side should check the id.
- Checked: unit tests (seats and the limit with members included, the matrix of who is told what, codes, cookies, revocation, reset, guessing), mutation-tested; and end to end through the built server (two guests, a member, the limit, an in-use code refused, a turned-off code, closing, guessing blocked, a members-only broadcast, permissions, the office never shown a code).
- Not built: reserving a place ahead of the broadcast (a place is taken on first entry while it is open), concurrent-viewer counting, and the soStream side of checking the viewer id.

**Still to build:** only the items under Out of scope. from the video host when the file is stored only there (step 4; not possible from YouTube, which does not return the original); and moving where the copies are kept (step 5): change the folder and move the files, keep a message only on the video host, or push to a new host from the master.

### Importing videos copied onto the server

Videos placed by hand in `<folder>/import` are listed on Church details > Video > Import videos from the folder. The server reads each MP4, M4V and MOV for its creation date, length and, from a phone, position (`server/lib/mp4-meta.ts`, no media tool needed; QuickTime's local-time key for iPhones is preferred over the UTC header), else uses the date in the file name or the file's modified date, and says which. Dates are counted in the church's time zone. It suggests teachings by nearest date and shared title words (`shared/video-import.ts`); a person confirms each match. Importing files the video exactly like an upload (`storeUploaded`: checksum, move, record, audit) and queues the send to the video host, and to YouTube when asked. Links and path tricks are refused; a teaching that already has a copy is only replaced when the person says so. A teaching has to exist first: each file offers "Add a teaching for this video", which opens the Teaching page's message form (`AdminSermonSlideover`) with the title and date from the file name, then rescans and chooses it. In that form's Speaker box, whoever holds `speakers:update` also sees adult church members not yet on the Speakers list; naming one adds them to it in the same transaction (`assertSpeakerPerson` / `addMemberAsSpeaker`, audited as `speaker.add`). Others get a 403 if they send such an id.

## Setup guides and version

- Two guides in Help, for those who may change Church details: **Setting up the church video host** and **Setting up YouTube posting**. Church details → Video links to them and shows each connection's state.
- The running version (from `package.json`, fixed at build) shows in the account menu for administrators and on Church details, to check which release they are looking at.

## To set up

1. Create a Bunny Stream library. Turn on **Keep original files before the first upload**, **token authentication**, and set **allowed domains** to this site.
2. Put the library id, the library API key and the token authentication key into the server's environment. Restart.

## Not verified against a real account

The play-link address, the status codes and the upload headers follow Bunny's published documentation, but have not been tried against a live library. Try one short video on the free trial first.

## Out of scope

- Live ingest and live players (soStream).
- Importing a recording from another system (the seam is `startHostedVideo`, to extend later).
- Cold or archive storage.
