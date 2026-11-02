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

## To set up

1. Create a Bunny Stream library. Turn on **Keep original files before the first upload**, **token authentication**, and set **allowed domains** to this site.
2. Put the library id, the library API key and the token authentication key into the server's environment. Restart.

## Not verified against a real account

The play-link address, the status codes and the upload headers follow Bunny's published documentation, but have not been tried against a live library. Try one short video on the free trial first.

## Out of scope

- Live ingest and live players (soStream).
- Importing a recording from another system (the seam is `startHostedVideo`, to extend later).
- Cold or archive storage.
