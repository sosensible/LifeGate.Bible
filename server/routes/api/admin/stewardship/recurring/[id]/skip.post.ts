import { skipOccurrenceSchema } from '../../../../../../../shared/stewardship.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { skipOccurrence } from '../../../../../../lib/recurring.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const { dueOn } = await readValidatedBody(event, skipOccurrenceSchema.parse)
  db.transaction((tx) => {
    skipOccurrence(tx, id, dueOn)
    recordAudit(tx, { actorUserId: session.user.id, action: 'recurring.skip', entityType: 'recurring', entityId: id, note: dueOn })
  })
  return { ok: true }
})
