---
title: Keeping a copy on the church server
summary: Choose a folder on the church's own server so the original of every teaching video is kept there too, in case the video host or YouTube ever goes away.
area: Video and teaching
order: 8
permission: integrations:manage
keywords: [local, copy, backup, folder, storage, original, server, disk, upload, offline]
---

When a folder is chosen, the original video file is **kept on the church's own server first**.
That copy is the master: if the video host or YouTube ever went down or closed, the church
still has every video. It is a safety copy; members watch from the video host, not from this
folder.

Only an **Admin** can set this up.

## 1. Choose a folder

1. Open **Church details** from your account menu, then open the **Video** section.
2. Under **Copy on the church server**, type the **full path** of a folder on the server, for
   example `/data/teaching-videos`. Write it as the server sees it, starting with `/`.
3. Press **Save folder**. The site makes the folder if it is missing, checks it can write there,
   and shows **On** with how much free space is left.

If it says it cannot write there, check that the folder exists on the server, that the server may
write to it, and, **if the site runs in a container, that the folder is on a mounted volume**.
A folder inside a container disappears when the site is updated.

## 2. What happens to an upload

When a volunteer chooses a video in **Manage teaching**, it is sent to the church server first, in
pieces of about 50 MB. If the connection drops, it carries on where it stopped. When it arrives
the site records its size and a checksum, and files it as:

`<your folder>/<year>/<message name>-<short id>/original.<type>`

The message then shows **Stored here** in the Video column, and **Stored on the church server**
in its form. Uploading again replaces the earlier copy.

## Things to know

- **Space.** One message is about 1.5 to 2 GB, so a weekly message uses roughly 90 GB a year. The
  page shows free space. An upload is refused, before it starts, if there is not room.
- **Back it up.** This folder is the church's master copy, so back it up like any other important
  data. Having a copy here is not a backup of the server itself.
- **Turning it off.** **Turn off** stops new copies being kept. The files already in the folder
  stay where they are.
- **Removing one copy.** In a message's form, **Remove local copy** deletes that file from the
  server. It does not touch the copy on the video host or YouTube. It needs the right to remove
  teaching.
- **Sent from this computer.** The upload goes to the church server through the website's
  connection. On the church's own network it does not leave the building.
- **Sent on by the server.** If the church video host is connected, the site sends the stored
  video on to it by itself, in the background, as soon as it has arrived. Nobody has to wait or keep
  the page open. The Video column shows **Waiting to send to host**, then **Sending to host**.
- **If sending fails.** It tries again by itself, waiting longer each time (1 minute, then 2, 4, 8,
  up to an hour), up to 8 tries. The message form shows what went wrong, and **Send now** starts it
  over. The copy already on the video host is left alone until the new one has fully arrived.
- **Sent to YouTube too.** If the church's YouTube channel is connected, the message form offers
  **Also post to YouTube** when the video is chosen. The church server then posts it for you in
  the background, as **unlisted**, and points the message at it once YouTube has it. It retries the
  same way, and a connection that drops carries on from where it stopped. Posting again replaces
  the YouTube link on the message; the earlier video stays on the channel.
- **Never played from here.** Members watch from the video host or YouTube. The church server only
  keeps the master copy and sends it on.
- **Bringing a copy in.** If a message's video is on the video host but not on the church server,
  open the message and press **Bring a copy here from the video host**. The server downloads the
  original in the background, checks it is exactly the file the host holds, and files it like any
  other. This needs the video host's **delivery hostname** (see below). It only works if the host
  still holds the original, which it does only if **Keep original files** was on when the video
  was uploaded. A video that is only on YouTube cannot be brought in, because YouTube does not give
  the original back; upload the file in the message form to keep a copy.

## Moving the stored videos to another folder

On **Church details**, in the **Video** section under **Copy on the church server**, type the new
folder under **Move the stored videos to another folder** and press **Move the stored videos**.

- Every video is **copied and checked against its checksum first**. Only when all of them are safely
  in the new folder does the site switch to it, and then the old files are removed. Until then the
  old folder is still the one in use and is not touched.
- A progress bar shows how many are done. **Uploads wait** while it runs.
- If something goes wrong (a damaged file, not enough room), the old folder is left exactly as it
  was. Press **Try again**, which does not copy again what is already checked, or **Give up and keep
  the old folder**, which removes the copies made in the new one.
- The new folder cannot be inside the old one, or the old one inside it, and must have room for
  everything.
- You cannot simply type a different folder in place of the old one while videos are stored,
  because the videos would be lost to the site. The page makes you use the move.

## Keeping a message only on the video host

In a message's form, **Keep only on the video host** removes the church server's copy. It first asks
the video host whether it holds the very same original (the checksums must match), and does
nothing if it cannot be sure. **Remove local copy** deletes without that check, and may be the last
copy, so it asks you to confirm.

## Sending everything again to a new place

If the church starts using a new video library or a new YouTube channel, press **the video host** or
**YouTube** next to **Send every stored video again to** in the same section. Every stored video is
queued and sent in the background, one at a time. A new copy replaces the old only once it has
fully arrived.

## The video host's delivery hostname

Only needed to bring a copy in from the video host. In Bunny, open the library, then **API**, then
**Pull Zone**, then **Manage**, and copy the hostname that ends in `.b-cdn.net`. Then, on **Church
details**, in the **Video** section under **Church video host**, paste it into **Delivery
hostname** and press **Save video host**.
