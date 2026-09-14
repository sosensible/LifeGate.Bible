// Every Better Auth endpoint: sign-in, sign-out, sessions, magic links,
// password reset.
//
// Better Auth's own admin endpoints (/api/auth/admin/*: set-role, ban,
// remove-user, impersonate...) are NOT reachable over HTTP. Account changes go
// through /api/admin/accounts, which adds the guards Better Auth does not have
// (never remove the last admin, never lock yourself out) and writes the audit
// log. Server code still calls auth.api.* directly.
import { auth } from '../../../lib/auth.ts'

export default defineEventHandler((event) => {
  if (event.path.startsWith('/api/auth/admin/')) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return auth.handler(toWebRequest(event))
})
