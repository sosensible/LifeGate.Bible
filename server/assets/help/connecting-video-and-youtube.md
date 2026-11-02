---
title: Connecting video and YouTube
summary: Where an Admin enters the keys for the church video host and YouTube, and which guide to follow for each.
area: Video and teaching
order: 5
permission: integrations:manage
keywords: [video, youtube, bunny, keys, connect, admin, church details, secret, encrypted]
---

Volunteers choose a message's video once, in the message form. Where it goes is decided by
connections that an **Admin** sets up, once, on **Church details**: the church video host,
YouTube, and a folder on the church's own server. You can use any of them, or all three. With neither, a message's video is posted to YouTube by hand and its link pasted in.

## Where to enter the keys

1. Open **Church details** from your account menu.
2. Press the **Video** title to open that section. It is closed until you open it.
3. Fill in the part you are setting up and press its **Save** button.

Anyone who is not an Admin sees the section with a note that an Admin has to update it. They
cannot see or change the keys.

## Which guide to follow

| To connect | You will enter | Guide |
|---|---|---|
| The church video host (Bunny) | Library ID, Library API key, Token authentication key | **Setting up the church video host** |
| The church's YouTube channel | Client ID and Client secret, then a sign-in to the channel | **Setting up YouTube posting** |
| A copy on the church's own server | A folder path | **Keeping a copy on the church server** |

Each guide says where to find every value and what to check afterwards.

## How the keys are kept

- Every key is **encrypted** in the site's database and is **never shown again** after it is
  saved. The page only says whether each one is set.
- Only the IDs that are not secret (the Library ID and the Client ID) are shown, so you can
  check them.
- Saving, removing or changing a key is recorded in the **audit log**, by name and never by
  value.
- If the site's own secret is ever changed, saved keys can no longer be read. The page then says
  a key is "saved, but can no longer be read", and you enter it again.

## Replacing or removing a key

Type the new value over the old one and press **Save**. Leave a key's box blank to keep what is
saved. The trash button beside a key removes it. Changing Google's Client ID or secret ends the
YouTube connection, so connect the channel again afterwards.
