import { countUpdateSchema } from '../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadCount, updateCount } from '../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  const { session, count } = await requireCountAccess(event, { write: true })
  const changes = await readValidatedBody(event, countUpdateSchema.parse)
  db.transaction((tx) => {
    const fields = updateCount(tx, count.id, changes)
    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'count.update', entityType: 'count', entityId: count.id, fields })
  })
  return { count: loadCount(count.id) }
})
