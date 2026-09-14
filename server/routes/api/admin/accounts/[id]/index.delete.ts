// Delete a sign-in account. A linked directory record is kept, unlinked.
import { assertSafeAccountChange, loadAccount } from '../../../../../lib/accounts.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { auth } from '../../../../../lib/auth.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { user: ['delete'] })
  const target = loadAccount(getRouterParam(event, 'id')!)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  assertSafeAccountChange(session.user.id, target, { kind: 'delete' })

  await auth.api.removeUser({ body: { userId: target.id }, headers: event.headers })
  // The email is kept in the note: once the account is gone it is the only way
  // to tell from the audit log whose account it was.
  recordAudit(db, { actorUserId: session.user.id, action: 'account.delete', entityType: 'user', entityId: target.id, note: target.email })

  setResponseStatus(event, 204)
  return null
})
