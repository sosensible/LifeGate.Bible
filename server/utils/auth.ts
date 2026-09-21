// Server-side guards, auto-imported into every server route.
//
// These are the real enforcement. Hiding a button in the UI is only a hint.
import type { H3Event } from 'h3'
import type { statement } from '../../shared/auth/permissions.ts'
import { auth } from '../lib/auth.ts'
import { servesInMissionsMinistry } from '../lib/missions.ts'

// Also used by server/lib/help.ts, where a help page names what it needs.
export type Permissions = {
  [Resource in keyof typeof statement]?: Array<(typeof statement)[Resource][number]>
}

export const getAuthSession = (event: H3Event) =>
  auth.api.getSession({ headers: event.headers })

export const requireSession = async (event: H3Event) => {
  const session = await getAuthSession(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  }
  return session
}

// Better Auth evaluates each of a user's roles on its own: a check passes only
// if ONE role covers every requested permission. Lifegate roles are additive
// ("member,pastor"), so a single combined check would wrongly deny someone who
// holds the permissions across two roles. Check each action separately and
// require all of them. (Verified against Better Auth 1.7.4; see
// tests/unit/auth-guard.spec.ts.)
export const hasPermission = async (userId: string, permissions: Permissions) => {
  for (const [resource, actions] of Object.entries(permissions)) {
    for (const action of actions ?? []) {
      const result = await auth.api.userHasPermission({
        body: { userId, permissions: { [resource]: [action] } },
      })
      if (!result?.success) return false
    }
  }
  return true
}

// Who is looking, for privacy decisions. Never throws: the public is a viewer too.
export const getViewer = async (event: H3Event) => {
  const session = await getAuthSession(event)
  if (!session) return { session: null, isMember: false, isStaff: false }
  const [isMember, isStaff] = await Promise.all([
    hasPermission(session.user.id, { directory: ['view'] }),
    hasPermission(session.user.id, { people: ['viewContact'] }),
  ])
  return { session, isMember, isStaff }
}

// Who is looking, for sermon visibility. Never throws.
export const getSermonViewer = async (event: H3Event) => {
  const session = await getAuthSession(event)
  if (!session) return { session: null, isMember: false, canManage: false }
  const [isMember, canManage] = await Promise.all([
    hasPermission(session.user.id, { memberArea: ['view'] }),
    hasPermission(session.user.id, { sermon: ['update'] }),
  ])
  return { session, isMember, canManage }
}

// Missions pages: members read them; staff, admins and people serving in the
// Missions ministry edit them.
export const getMissionsViewer = async (event: H3Event) => {
  const session = await getAuthSession(event)
  if (!session) return { session: null, isMember: false, canEdit: false, canDelete: false }
  const [isMember, hasRolePermission, canDelete] = await Promise.all([
    hasPermission(session.user.id, { memberArea: ['view'] }),
    hasPermission(session.user.id, { missions: ['update'] }),
    hasPermission(session.user.id, { missions: ['delete'] }),
  ])
  // canDelete: staff and admins, who alone see the archive, restore and remove.
  return { session, isMember, canEdit: canDelete || hasRolePermission || servesInMissionsMinistry(session.user.id), canDelete }
}

export const requireMissionsReader = async (event: H3Event) => {
  const viewer = await getMissionsViewer(event)
  if (!viewer.session) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  if (!viewer.isMember && !viewer.canEdit) throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  return viewer
}

export const requireMissionsEditor = async (event: H3Event) => {
  const viewer = await requireMissionsReader(event)
  if (!viewer.canEdit) throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  return viewer as typeof viewer & { session: NonNullable<typeof viewer.session> }
}

export const requireMissionsDeleter = async (event: H3Event) => {
  const viewer = await requireMissionsEditor(event)
  if (!viewer.canDelete) throw createError({ statusCode: 403, statusMessage: 'Only staff and administrators can do that' })
  return viewer
}

// People who keep the Speakers list; canDelete also sees the archive.
export const requireSpeakersEditor = async (event: H3Event) => {
  const session = await requirePermission(event, { speakers: ['update'] })
  return { session, canDelete: await hasPermission(session.user.id, { speakers: ['delete'] }) }
}

export const requireSpeakersDeleter = async (event: H3Event) => {
  const viewer = await requireSpeakersEditor(event)
  if (!viewer.canDelete) throw createError({ statusCode: 403, statusMessage: 'Only staff and administrators can do that' })
  return viewer
}

// Stewardship: what the signed-in person may do with the church budget.
// Ministry leaders' access comes from grants, not roles; see
// server/lib/stewardship-access.ts.
export const getStewardshipViewer = async (event: H3Event) => {
  const session = await requireSession(event)
  const [canView, canManage, canGrant] = await Promise.all([
    hasPermission(session.user.id, { stewardship: ['view'] }),
    hasPermission(session.user.id, { stewardship: ['manage'] }),
    hasPermission(session.user.id, { stewardship: ['grantAccess'] }),
  ])
  return { session, canView, canManage, canGrant }
}

// Giving: what the signed-in person may do with offerings and statements.
// Throws unless they can at least record gifts.
export const getGivingViewer = async (event: H3Event) => {
  const session = await requireSession(event)
  const [canRecord, canView, canManage] = await Promise.all([
    hasPermission(session.user.id, { giving: ['record'] }),
    hasPermission(session.user.id, { giving: ['view'] }),
    hasPermission(session.user.id, { giving: ['manage'] }),
  ])
  if (!canRecord && !canView && !canManage) throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  return { session, canRecord, canView, canManage }
}

// Passes if the person has ANY of the listed permission sets.
export const requireAnyPermission = async (event: H3Event, options: Permissions[]) => {
  const session = await requireSession(event)
  for (const permissions of options) {
    if (await hasPermission(session.user.id, permissions)) return session
  }
  throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
}

export const requirePermission = async (event: H3Event, permissions: Permissions) => {
  const session = await requireSession(event)
  if (!(await hasPermission(session.user.id, permissions))) {
    throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  }
  return session
}
