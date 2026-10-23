// Rename a list, change who can see it, or make it numbered.
import { listPatchSchema } from '../../../../shared/ministry-lists.ts'
import { recordAudit } from '../../../lib/audit.ts'
import { db } from '../../../lib/db.ts'
import { updateList } from '../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireListViewer(event)
  const id = getRouterParam(event, 'id') ?? ''
  const patch = await readValidatedBody(event, listPatchSchema.parse)

  const fields = db.transaction((tx) => {
    const changed = updateList(tx, viewer, id, patch)
    if (changed.length) recordAudit(tx, { actorUserId: session.user.id, action: 'ministryList.update', entityType: 'ministryList', entityId: id, fields: changed })
    return changed
  })
  return { fields }
})
