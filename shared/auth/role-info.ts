// Plain-language descriptions of roles and permissions for the accounts page.
// What each role can actually do comes from ./permissions.ts; this only names it.
import { roles, type RoleName } from './permissions.ts'

// Roles an administrator can assign, in the order they are shown. `user` is not
// listed: it is what an account has when it has none of these.
export const ASSIGNABLE_ROLES = ['member', 'pastor', 'deacon', 'churchSecretary', 'directoryManager', 'contentEditor', 'treasurer', 'counter', 'financeCommittee', 'admin'] as const satisfies readonly RoleName[]
export type AssignableRole = typeof ASSIGNABLE_ROLES[number]

export const ROLE_INFO: Record<RoleName, { label: string, description: string }> = {
  user: { label: 'No role', description: 'Can sign in, but sees nothing beyond the public site.' },
  member: { label: 'Member', description: 'The member area, directory, ministry rosters and members-only teaching.' },
  pastor: { label: 'Pastor', description: 'Sees phone, email and address for everyone in the directory.' },
  directoryManager: { label: 'Directory manager', description: 'Keeps the directory: people, households, ministries, and sharing on someone’s behalf.' },
  contentEditor: { label: 'Content editor', description: 'Adds, edits and publishes teaching, and schedules live meetings.' },
  deacon: { label: 'Deacon', description: 'Decides what each ministry can see of its budget. Sees no amounts.' },
  churchSecretary: { label: 'Church secretary', description: 'Keeps the list of ministries, and decides what each ministry can see of its budget. Sees no amounts.' },
  treasurer: { label: 'Treasurer', description: 'Keeps Stewardship: accounts, transactions, categories, the budget, offerings and giving statements.' },
  counter: { label: 'Counter', description: 'Enters gifts in open offering counts. Sees no giving history.' },
  financeCommittee: { label: 'Finance committee', description: 'Reads Stewardship: accounts, transactions, the budget and reports.' },
  admin: { label: 'Administrator', description: 'Accounts, roles and the audit log, plus every other area except Stewardship.' },
  // Defined for pastoral applications, which the church does not take through
  // the site. Grants nothing in use, so it is not offered on the accounts page.
  searchCommittee: { label: 'Search committee', description: 'Not in use.' },
}

const PERMISSION_LABELS: Record<string, string> = {
  'memberArea.view': 'Member area',
  'directory.view': 'Directory',
  'people.viewContact': 'See contact details',
  'people.create': 'Add people',
  'people.update': 'Edit people',
  'people.delete': 'Remove people',
  'people.managePrivacy': 'Change sharing for others',
  'sermon.create': 'Add teaching',
  'sermon.update': 'Edit teaching',
  'sermon.delete': 'Remove teaching',
  'sermon.publish': 'Publish teaching',
  'liveMeeting.manage': 'Schedule live meetings',
  'ministry.update': 'Edit ministries',
  'missions.update': 'Edit missions',
  'missions.delete': 'Restore or permanently remove archived missions',
  'speakers.update': 'Add, edit and archive speakers',
  'speakers.delete': 'Restore or permanently remove archived speakers',
  'contactMessage.view': 'Read contact messages',
  'audit.view': 'Audit log',
  'stewardship.view': 'See the church budget and transactions',
  'stewardship.manage': 'Keep the church budget and transactions',
  'stewardship.grantAccess': 'Decide what ministries see of the budget',
  'giving.record': 'Enter gifts in open offering counts',
  'giving.view': 'See giving records, counts and statements',
  'giving.manage': 'Keep giving records, close counts and send statements',
  'user.list': 'Manage accounts',
  'user.set-role': 'Assign roles',
  'user.ban': 'Block accounts',
  'user.delete': 'Delete accounts',
}

// "Member area, Directory" etc., for one role.
export const permissionLabels = (role: RoleName) =>
  Object.entries(roles[role].statements as Record<string, readonly string[]>)
    .flatMap(([resource, actions]) => actions.map(action => PERMISSION_LABELS[`${resource}.${action}`]))
    .filter((label): label is string => Boolean(label))

// Stored as "member,admin"; `user` or empty means no role.
export const parseRoles = (value: string | null | undefined): AssignableRole[] =>
  String(value ?? '')
    .split(',')
    .map(role => role.trim())
    .filter((role): role is AssignableRole => (ASSIGNABLE_ROLES as readonly string[]).includes(role))
