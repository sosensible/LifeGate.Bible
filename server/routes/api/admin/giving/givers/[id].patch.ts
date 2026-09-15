import { giverUpdateSchema } from '../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadGiver, setGiverArchived, updateGiver } from '../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const { giver, archived } = await readValidatedBody(event, giverUpdateSchema.parse)

  db.transaction((tx) => {
    if (giver) {
      const fields = updateGiver(tx, id, giver)
      if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'giver.update', entityType: 'giver', entityId: id, fields })
    }
    if (archived !== undefined && setGiverArchived(tx, id, archived)) {
      recordAudit(tx, { actorUserId: session.user.id, action: archived ? 'giver.archive' : 'giver.restore', entityType: 'giver', entityId: id })
    }
  })
  return { giver: loadGiver(id, yearQuery(event)) }
})
