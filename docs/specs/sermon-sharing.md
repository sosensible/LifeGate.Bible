# Spec: Who may share a message

Status: **built 2026-11-02; not committed or deployed.**
Owner: John · Target: this site (Nuxt 4 + Nuxt UI v4)

## Goal

Four parties each have their own control over whether a message is shared. Any one of
them can stop it, none can override another, and each lifts only what it set.

## Decisions already made

| Question | Decision |
|---|---|
| Parties | The **church office** (publish, and members-only or everyone), the message's **teacher**, the **pastor**, an **administrator**. |
| Teacher control | **Starts open, only narrows.** Existing and new messages show as the office set them. A teacher can limit one to members, or withdraw it. Never wider than the office allows. |
| Pastor and administrator | A **pause** each, placed and lifted separately. |
| Lifting | **Only who placed it.** The teacher, the pastor and an administrator each have their own block; nobody lifts another's. |
| Result | The **narrowest** audience any party allows, and **nobody** while any one blocks it. |
| Who still opens a blocked message | Those who run the teaching (`sermon.update`) always. The pastor and administrators open a published, paused message so they can lift their pause. Its teacher always opens their own. |
| Who is told | Only the teacher, the pastor, administrators and those who run the teaching see that a message is paused, and by whom. Lists give everyone else no hint. |

## How it works

- `shared/sermon-sharing.ts`: `availability()` turns status, visibility, the teacher's choice
  and the pauses into an audience (`public`, `members`, `nobody`) and who is blocking.
- `sermons.teacher_share` (`public` | `members` | `none`, default `public`) and
  `sermon_holds` (one row per message and party, with who placed it and when). Migration 0026.
- Permissions `sermonHold.pastor` (pastor role) and `sermonHold.admin` (admin role).
  Roles are additive, so one person with both roles holds both pauses; they stay separate.
- Routes: `PUT /api/teaching/mine/:id/share` (the teacher), `PUT` and `DELETE`
  `/api/admin/sermons/:id/holds/:party`. Each change is recorded in the audit log
  (`sermon.share`, `sermon.hold`).
- Enforcement is in `canViewSermon`, so the lists, the message page, a speaker's page and the
  sitemap all follow it. A paused message leaves the sitemap.

## Screens

- **My teaching**: a Sharing button on each row opens a dialog with the teacher's three choices.
- **Teaching (office)**: a Sharing button on each row; badges for "Paused by …" or "Limited by teacher".
- **Message page**: a Sharing panel in the sidebar for the people named above.

## Out of scope

- A guest speaker with no account: only the office controls their messages.
- Notifying the teacher when a pause is placed.
- Scheduling a pause to end on a date.
- Video storage and broadcast: see its own spec when decided.
