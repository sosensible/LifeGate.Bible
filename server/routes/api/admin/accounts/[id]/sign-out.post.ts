// End every session for an account, e.g. after a lost phone.
import { loadAccount } from '../../../../../lib/accounts.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { auth } from '../../../../../lib/auth.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { session: ['revoke'] })
  const target = loadAccount(getRouterParam(event, 'id')!)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  await auth.api.revokeUserSessions({ body: { userId: target.id }, headers: event.headers })
  recordAudit(db, { actorUserId: session.user.id, action: 'account.signOutEverywhere', entityType: 'user', entityId: target.id })

  return { account: loadAccount(target.id) }
})
