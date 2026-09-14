// Email the account a link to choose a new password (valid one hour).
import { loadAccount } from '../../../../../lib/accounts.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { auth, linkOrigin } from '../../../../../lib/auth.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { user: ['update'] })
  const target = loadAccount(getRouterParam(event, 'id')!)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
  if (target.blocked) throw createError({ statusCode: 400, statusMessage: 'Unblock this account first' })

  await auth.api.requestPasswordReset({
    body: { email: target.email, redirectTo: `${linkOrigin(event.headers)}/auth/reset-password` },
    headers: event.headers,
  })
  recordAudit(db, { actorUserId: session.user.id, action: 'account.passwordLink', entityType: 'user', entityId: target.id })

  return { sent: true }
})
