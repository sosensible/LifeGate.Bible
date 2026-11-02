---
title: Setting up the church video host
summary: Connect the church's own video library (Bunny Stream) so volunteers can upload a message's video once and it plays from our own host.
area: Video and teaching
order: 10
permission: integrations:manage
keywords: [video, bunny, upload, host, library, stream, setup, token, playback]
---

The church video host keeps its own copy of each message's video. It plays instead of
YouTube once it is ready, and the site hands out a short-lived play link only to someone who
may watch that message, so pausing or limiting a message really stops it. You set this up
once.

You need an account at **bunny.net**. A free trial is available, so you can try one short
video before the church relies on it. Bunny's screens change from time to time; if a label
below is a little different, look for the nearest match.

## 1. Create a video library

1. Sign in at bunny.net and open **Stream**.
2. Choose **Add Video Library**. Give it a name such as "Lifegate messages".
3. Pick where it is stored. One region close to your members is enough.

## 2. Switch on three settings in the library

Open the library, then:

1. **Keep original files.** Turn this on **before the first upload**. It cannot be applied to
   videos already uploaded. It keeps the original so the video can be re-processed later.
2. **Token authentication.** In the library's **Security** settings, turn it on. This is what
   makes the site's play links work, and what stops a copied address from playing.
3. **Allowed domains.** Add this site's address, for example `church.example`, with no
   `https://`. Only pages on that address may play the videos.

## 3. Copy three values

| Value | Where to find it | Setting name |
|---|---|---|
| Library ID | The number shown for the library | `BUNNY_LIBRARY_ID` |
| Library API key | The library's **API** page | `BUNNY_API_KEY` |
| Token authentication key | The library's **Security** page. It is labelled "API key" there, but it is a **different value** from the one above. | `BUNNY_TOKEN_KEY` |

Treat the two keys like passwords. Do not send them in email or chat.

## 4. Enter them on the site

Only an **Admin** can do this. Everyone else sees a note asking them to ask an Admin.

1. Open **Church details** from your account menu.
2. Open the **Video** section (press its title to expand it).
3. Under **Church video host**, type the **Library ID**, paste the **Library API key**, and paste
   the **Token authentication key**.
4. Press **Save video host**. The badge changes to **Connected**.

The two keys are kept encrypted and are never shown again, so if you need to check one, look
in Bunny. To replace a key, paste the new one over it and save; leave a key box blank to keep
the saved one. The trash button next to a key removes it.

## 5. Check it works

1. On **Church details**, the **Video** section's **Church video host** badge should say **Connected**.
2. Open **Manage teaching** and add a message. The **Church video** section now has a box to
   choose a video file.
3. Upload a short test video. The Video column shows **Uploading**, then **Getting ready**,
   then **Ready**.
4. Open the message and press play.

## If something is off

- **Still "Getting ready" after a long time.** Open the library in Bunny and check the video's
  status there, then press **Check** on the message.
- **"Did not process".** Replace it with another file. A damaged or unusual file can fail.
- **The video does not play on the message page.** Check that the allowed domain is exactly the
  site's address, and that token authentication is on.
- **The Church video section says "Not connected yet".** One of the three values is missing.
  Open **Church details**, then **Video**, and check each one is saved.

## What it costs

Bunny charges for what is stored and what is watched. At the size of one message a week with a
modest number of households watching, expect a few dollars a month. Check Bunny's current prices.
