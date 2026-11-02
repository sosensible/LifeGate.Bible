---
title: Running a shared broadcast
summary: Put a stream from soStream on a locked page of this site, let members in with no code, give guests a code each, and limit how many people can watch.
area: Video and teaching
order: 30
permission: liveMeeting:manage
keywords: [broadcast, stream, live, watch, guest, code, limit, seats, soStream, members, locked, event]
---

A **shared broadcast** is a locked page on this site where people watch a stream that comes from
somewhere else, such as soStream. This site does not carry the stream. It decides **who may open the
page** and **how many people in total**, and only then shows the stream.

Open **Shared broadcasts** from your account menu.

## Add a broadcast

1. Press **Add a broadcast**.
2. **Title** and **Notes** are shown at the top of the page.
3. **Stream address**: where the stream is shown from, starting with `https://`. If the stream needs an
   id for each person watching, put `{viewer}` in the address where it goes. Each person gets their own
   id, the same every time, and it means nothing outside this site.
4. **Who may watch**:
   - **Signed-in members only**: members sign in and watch. Nobody else can.
   - **Members, and guests with a code**: members watch with no code; guests need a code made for them.
5. **Most people in total**: leave it empty for no limit. See *The limit* below.
6. **Open**: nothing can be watched while this is off. A broadcast starts closed.
7. **Opens at** and **Ends at** are optional. It is open only while the switch is on **and** the dates allow it.
   After **Ends at** it shows as ended, whatever the switch says.

Press the link button on its row to copy the address people use: `/watch/<name>`. Send that address.

## Members

A signed-in member opens the address and watches. They need **no code**. A member still takes a place
if the broadcast has a limit.

## Guests

On a broadcast that admits guests, press the ticket button on its row, type **who the code is for**,
and press **Make a code**. The code is shown **once**, with a button that copies a ready invitation
(the address and the code). Send it to that one person.

- **One code is one person, on one device.** The first browser to use a code is remembered. Anyone else
  who tries the same code is turned away.
- If a guest changes device, or clears their browser's cookies, press **New code** beside their name.
  The old code and the old device stop working.
- **Turn off** ends a code for good and gives its place back.
- Only a scrambled copy of each code is kept, so a lost code cannot be looked up. Make a new one.
- A few wrong codes in a row from one place make it wait ten minutes.

## The limit

The limit is the most **people in total** who may take a place. Members and guests share the same places.
A person takes a place the first time they get in while the broadcast is open, and keeps it, so closing
the page and coming back is fine. When all the places are taken, a new person sees "All the places are
taken". Turning off a guest's code gives its place back. **Give all places back** (in the broadcast's
form) clears every place, for the next time.

The limit counts people who have **been let in**, not how many are watching at this moment.

## What this does not do

- It does not protect the stream itself. The stream's address is sent to a person's browser only after
  they are let in, but anyone who has that address could open it directly. To close that gap, use the
  `{viewer}` id so soStream can check each viewer, or have soStream check the person before it plays.
- The page is not listed anywhere and tells search engines to ignore it, but anyone with the address can
  see that a broadcast exists. They still need to be a member or hold a code.
- The count of wrong codes is kept in memory, so it starts fresh when the site restarts.
