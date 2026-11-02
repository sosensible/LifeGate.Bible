---
title: Setting up YouTube posting
summary: Connect the church's YouTube channel so a video chosen in the message form is also posted to YouTube, unlisted, without anyone doing it by hand.
area: Video and teaching
order: 20
permission: integrations:manage
keywords: [youtube, channel, google, upload, connect, oauth, setup, unlisted]
---

Once the church's YouTube channel is connected, a volunteer chooses a video once in the message
form, and it can be posted to the channel as **unlisted** (only people with the link can find
it). Without this, someone uploads to YouTube by hand and pastes the link into the message,
which still works.

This takes about half an hour, once. Google's screens change from time to time; if a label is a
little different, look for the nearest match.

## 1. The church's channel

Use a channel the **church** owns, not a personal one, so videos do not disappear when a
volunteer leaves.

1. Sign in to YouTube with the church's Google account.
2. Create a channel for the church. A **brand account** channel is best, because several
   people can be added as managers.

## 2. A Google Cloud project

1. Go to **console.cloud.google.com** and sign in as the person who will manage this.
2. Create a project, for example "Lifegate site".
3. Open **APIs & Services**, then **Library**, find **YouTube Data API v3**, and press
   **Enable**.

## 3. The consent screen

1. Open **OAuth consent screen** (also called **Google Auth Platform**).
2. Choose **External** and give the app a name the church will recognise.
3. Add a support email and a contact email.
4. Under **Scopes**, add these two and nothing more:
   - `youtube.upload`: lets the site post videos
   - `youtube.readonly`: lets the site read the channel's name
5. While the app is in **Testing**, add the person who will connect the channel as a **test
   user**.

## 4. Make the connection last

Google's documentation says a connection made while the app is in **Testing** stops working
after **7 days**. To avoid reconnecting every week, **publish the app** (set its status to
**In production**).

Google may then show an "unverified app" warning when you connect. It is the church's own app,
so choose **Advanced**, then continue. I could not confirm from Google's pages whether Google
requires a review for these two scopes; if it asks for one, follow its instructions.

## 5. Create the sign-in key

1. Open **Credentials**, then **Create credentials**, then **OAuth client ID**.
2. Choose **Web application**.
3. Under **Authorized redirect URIs**, add this site's address exactly as shown on the **Church
   details** page, in the **Video** section, under **YouTube channel**. It ends in `/api/admin/youtube/callback`.
4. Copy the **Client ID** and the **Client secret**.

## 6. Enter them on the site

Only an **Admin** can do this. Everyone else sees a note asking them to ask an Admin.

1. Open **Church details** from your account menu, then open the **Video** section.
2. Under **YouTube channel**, type the **Client ID** and paste the **Client secret**.
3. Press **Save YouTube keys**. The badge changes to **Ready to connect**.

The secret is kept encrypted and is never shown again. Changing the Client ID or secret later
ends the current connection, because the connection only works with the keys it was made
under, and you connect the channel again.

## 7. Connect the channel

1. On **Church details**, in the **Video** section, press **Connect YouTube channel**.
2. Sign in as the owner of the church's channel. If asked, choose the church's channel, not a
   personal one.
3. Approve the two permissions. You are sent back to Church details, which now shows the
   channel's name.

## Using it

In **Manage teaching**, add a message and choose the video file. If the church video host is
also connected, a switch offers **Also post to YouTube**. The file is sent from the volunteer's
own computer, so a message posted to both takes about twice as long to upload.

The site only posts videos to this one channel and can do nothing else on it.

## If something is off

- **"Not set up on this site yet".** The Client ID or secret is missing. Enter both under **Church details**, **Video**.
- **Google says the redirect does not match.** The address in step 5 must match the one on
  Church details exactly.
- **Connection stops after about a week.** The app is still in Testing. Publish it (step 4).
- **No lasting access given.** Remove the site from the Google account's connected apps and
  connect again.
- **Disconnecting.** Press **Disconnect** on Church details. Videos already on YouTube stay.
