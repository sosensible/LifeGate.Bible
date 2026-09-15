import { eq } from 'drizzle-orm'
import { payeeRules } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!

  const deleted = db.transaction((tx) => {
    const row = tx.delete(payeeRules).where(eq(payeeRules.id, id)).returning({ id: payeeRules.id }).get()
    if (row) recordAudit(tx, { actorUserId: session.user.id, action: 'rule.delete', entityType: 'payeeRule', entityId: id })
    return row
  })
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Rule not found' })
  setResponseStatus(event, 204)
  return null
})
