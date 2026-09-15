import { giftSchema } from '../../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { addGift, loadCount } from '../../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  const { session, count } = await requireCountAccess(event, { write: true })
  const input = await readValidatedBody(event, giftSchema.parse)
  db.transaction((tx) => {
    addGift(tx, count.id, input)
    recordAudit(tx, { actorUserId: session.user.id, action: 'gift.add', entityType: 'count', entityId: count.id })
  })
  setResponseStatus(event, 201)
  return { count: loadCount(count.id) }
})
