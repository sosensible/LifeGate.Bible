import { reopenCountSchema } from '../../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { loadCount, reopenCount } from '../../../../../../lib/giving.ts'

// The reason is kept on the count, not in the audit log: admins read the log,
// and a reason may name a giver or an amount.
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const { note } = await readValidatedBody(event, reopenCountSchema.parse)
  db.transaction((tx) => {
    reopenCount(tx, id, note)
    recordAudit(tx, { actorUserId: session.user.id, action: 'count.reopen', entityType: 'count', entityId: id })
  })
  return { count: loadCount(id) }
})
