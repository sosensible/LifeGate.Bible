import { loadAccount } from '../../../../../lib/accounts.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { auth } from '../../../../../lib/auth.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { user: ['ban'] })
  const target = loadAccount(getRouterParam(event, 'id')!)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  if (target.blocked) {
    await auth.api.unbanUser({ body: { userId: target.id }, headers: event.headers })
    recordAudit(db, { actorUserId: session.user.id, action: 'account.unblock', entityType: 'user', entityId: target.id })
  }

  return { account: loadAccount(target.id) }
})
