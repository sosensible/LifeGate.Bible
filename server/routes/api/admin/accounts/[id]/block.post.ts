// Block an account: it cannot sign in, and its current sessions end.
import { accountBlockSchema } from '../../../../../../shared/accounts.ts'
import { assertSafeAccountChange, loadAccount } from '../../../../../lib/accounts.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { auth } from '../../../../../lib/auth.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { user: ['ban'] })
  const target = loadAccount(getRouterParam(event, 'id')!)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  const { reason } = await readValidatedBody(event, accountBlockSchema.parse)
  assertSafeAccountChange(session.user.id, target, { kind: 'block' })

  if (!target.blocked) {
    await auth.api.banUser({ body: { userId: target.id, banReason: reason || undefined }, headers: event.headers })
    recordAudit(db, { actorUserId: session.user.id, action: 'account.block', entityType: 'user', entityId: target.id, note: reason || undefined })
  }

  return { account: loadAccount(target.id) }
})
