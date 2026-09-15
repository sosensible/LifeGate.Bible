import { giftUpdateSchema } from '../../../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../../../lib/audit.ts'
import { db } from '../../../../../../../lib/db.ts'
import { loadCount, updateGift } from '../../../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  const { session, count } = await requireCountAccess(event, { write: true })
  const giftId = getRouterParam(event, 'giftId')!
  const input = await readValidatedBody(event, giftUpdateSchema.parse)
  db.transaction((tx) => {
    const fields = updateGift(tx, count.id, giftId, input)
    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'gift.update', entityType: 'count', entityId: count.id, fields })
  })
  return { count: loadCount(count.id) }
})
