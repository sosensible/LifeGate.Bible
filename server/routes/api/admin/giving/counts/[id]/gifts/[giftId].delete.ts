import { recordAudit } from '../../../../../../../lib/audit.ts'
import { db } from '../../../../../../../lib/db.ts'
import { loadCount, removeGift } from '../../../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  const { session, count } = await requireCountAccess(event, { write: true })
  const giftId = getRouterParam(event, 'giftId')!
  db.transaction((tx) => {
    removeGift(tx, count.id, giftId)
    recordAudit(tx, { actorUserId: session.user.id, action: 'gift.remove', entityType: 'count', entityId: count.id })
  })
  return { count: loadCount(count.id) }
})
