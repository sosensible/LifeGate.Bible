import { accountRolesSchema } from '../../../../../../shared/accounts.ts'
import { assertSafeAccountChange, loadAccount, storedRoles } from '../../../../../lib/accounts.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { auth } from '../../../../../lib/auth.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { user: ['set-role'] })
  const target = loadAccount(getRouterParam(event, 'id')!)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  const { roles } = await readValidatedBody(event, accountRolesSchema.parse)
  assertSafeAccountChange(session.user.id, target, { kind: 'roles', roles })

  const before = target.roles.join(', ') || 'none'
  const after = [...new Set(roles)].join(', ') || 'none'
  if (before !== after) {
    // With the caller's headers, so Better Auth checks their permission as well.
    await auth.api.setRole({ body: { userId: target.id, role: storedRoles(roles) as never }, headers: event.headers })
    recordAudit(db, { actorUserId: session.user.id, action: 'account.roles', entityType: 'user', entityId: target.id, fields: ['roles'], note: `${before} → ${after}` })
  }

  return { account: loadAccount(target.id) }
})
