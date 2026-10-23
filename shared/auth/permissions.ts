// Roles and permissions for Lifegate, using Better Auth's access-control plugin.
//
// Shared by the server (enforcement) and the app (showing or hiding UI). The
// server is the only thing that actually enforces; a hidden button is not a
// permission check.
//
// Roles are ADDITIVE. A person usually holds `member` plus zero or more staff
// roles, e.g. "member,contentEditor". Better Auth stores multiple roles on a
// user as a comma-separated string.
//
// `user` exists on purpose: an account is not automatically a church member.
// Future account types can sign in without seeing anything in the member area.
import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access'

export const statement = {
  // Better Auth's own resources: `user` and `session` management.
  ...defaultStatements,

  // The member area as a whole: /members, /calendar, members-only sermons.
  memberArea: ['view'],
  // Seeing other people's directory entries (subject to their privacy choices).
  directory: ['view'],
  // `viewContact` is what makes someone "staff" for privacy purposes: staff
  // always see phone, email and address. Everything else stays opt-in.
  people: ['viewContact', 'create', 'update', 'delete', 'managePrivacy'],
  sermon: ['create', 'update', 'delete', 'publish'],
  // Scheduling Google Meet and YouTube Live links on the Teaching page.
  liveMeeting: ['manage'],
  ministry: ['update'],
  // The church's name, address, logo, contact details and service times
  // (/admin/site). Reading them is public; this is who may change them.
  siteSettings: ['update'],
  // Ministry lists (server/lib/ministry-lists.ts). This is ONLY the read-only
  // overview staff get across every ministry. Running a ministry's lists comes
  // from the roster -- its leaders manage them, its members work them -- not
  // from a role, so it passes to a new leader with no change here. `view` reads
  // every ministry's lists; `viewLeadersOnly` also reads the ones a ministry's
  // leaders keep to themselves. Deliberately not granted to admins.
  ministryList: ['view', 'viewLeadersOnly'],
  // The members-only Missions pages. `update` is also granted, outside roles, to
  // anyone who serves in the Missions ministry (server/lib/missions.ts); they
  // can archive entries. Only `delete` (staff and admins) sees the archive,
  // restores from it, or removes entries for good.
  missions: ['update', 'delete'],
  // The Speakers list in the directory. `update` adds, edits and archives;
  // `delete` (staff and admins) sees the archive, restores and removes.
  speakers: ['update', 'delete'],
  contactMessage: ['view'],
  // Deliberately granted to Search Committee only -- not even to admins.
  pastoralApplication: ['view'],
  audit: ['view'],
  // Stewardship: the church's accounts, transactions, categories and budget.
  // Deliberately NOT granted to admins, like pastoralApplication. `view` reads
  // everything; `manage` categorizes, funds and keeps accounts and categories;
  // `grantAccess` decides what each ministry may see, and sees no amounts at all.
  // Ministry leaders get their own view from those grants, not from a role
  // (server/lib/stewardship-access.ts).
  stewardship: ['view', 'manage', 'grantAccess'],
  // Giving: offerings and year-end statements. Donor-level giving, so granted
  // to the Treasurer and counters only: not admins, pastors or the finance
  // committee (they see offering totals through the budget). `record` enters gifts
  // in open counts and sees nothing else; `view` reads counts, giving records
  // and statements; `manage` keeps giving records, closes counts and sends
  // statements.
  giving: ['record', 'view', 'manage'],
} as const

export const ac = createAccessControl(statement)

export const user = ac.newRole({})

export const member = ac.newRole({
  memberArea: ['view'],
  directory: ['view'],
})

export const contentEditor = ac.newRole({
  sermon: ['create', 'update', 'delete', 'publish'],
  liveMeeting: ['manage'],
  ministry: ['update'],
  speakers: ['update'],
})

export const directoryManager = ac.newRole({
  people: ['viewContact', 'create', 'update', 'delete', 'managePrivacy'],
  missions: ['update', 'delete'],
  speakers: ['update', 'delete'],
})

export const pastor = ac.newRole({
  people: ['viewContact'],
  ministryList: ['view', 'viewLeadersOnly'],
  missions: ['update', 'delete'],
  speakers: ['update', 'delete'],
  contactMessage: ['view'],
  stewardship: ['grantAccess'],
})

export const treasurer = ac.newRole({
  stewardship: ['view', 'manage'],
  giving: ['record', 'view', 'manage'],
})

// Enters gifts on Sunday. Sees only counts that are still open.
export const counter = ac.newRole({
  giving: ['record'],
})

export const financeCommittee = ac.newRole({
  stewardship: ['view'],
})

// Deacons and the church secretary decide what each ministry sees of its
// budget. A deacon is a role here, not the free-text title on a person.
export const deacon = ac.newRole({
  stewardship: ['grantAccess'],
})

export const churchSecretary = ac.newRole({
  stewardship: ['grantAccess'],
  ministry: ['update'],
  siteSettings: ['update'],
  ministryList: ['view'],
})

export const searchCommittee = ac.newRole({
  pastoralApplication: ['view'],
})

export const admin = ac.newRole({
  ...adminAc.statements,
  people: ['viewContact', 'create', 'update', 'delete', 'managePrivacy'],
  sermon: ['create', 'update', 'delete', 'publish'],
  liveMeeting: ['manage'],
  ministry: ['update'],
  siteSettings: ['update'],
  missions: ['update', 'delete'],
  speakers: ['update', 'delete'],
  contactMessage: ['view'],
  audit: ['view'],
})

export const roles = {
  user,
  member,
  contentEditor,
  directoryManager,
  pastor,
  searchCommittee,
  treasurer,
  counter,
  financeCommittee,
  deacon,
  churchSecretary,
  admin,
}

export type RoleName = keyof typeof roles
