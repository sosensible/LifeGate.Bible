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
  ministry: ['update'],
  contactMessage: ['view'],
  // Deliberately granted to Search Committee only -- not even to admins.
  pastoralApplication: ['view'],
  audit: ['view'],
} as const

export const ac = createAccessControl(statement)

export const user = ac.newRole({})

export const member = ac.newRole({
  memberArea: ['view'],
  directory: ['view'],
})

export const contentEditor = ac.newRole({
  sermon: ['create', 'update', 'delete', 'publish'],
  ministry: ['update'],
})

export const directoryManager = ac.newRole({
  people: ['viewContact', 'create', 'update', 'delete', 'managePrivacy'],
})

export const pastor = ac.newRole({
  people: ['viewContact'],
  contactMessage: ['view'],
})

export const searchCommittee = ac.newRole({
  pastoralApplication: ['view'],
})

export const admin = ac.newRole({
  ...adminAc.statements,
  people: ['viewContact', 'create', 'update', 'delete', 'managePrivacy'],
  sermon: ['create', 'update', 'delete', 'publish'],
  ministry: ['update'],
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
  admin,
}

export type RoleName = keyof typeof roles
