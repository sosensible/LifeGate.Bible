// Server-side guards, auto-imported into every server route.
//
// These are the real enforcement. Hiding a button in the UI is only a hint.
import type { H3Event } from 'h3'
import type { statement } from '../../shared/auth/permissions.ts'
import { auth } from '../lib/auth.ts'

type Permissions = {
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

export const requirePermission = async (event: H3Event, permissions: Permissions) => {
  const session = await requireSession(event)
  if (!(await hasPermission(session.user.id, permissions))) {
    throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  }
  return session
}
