import { emptyToNull } from '../../../../../../shared/people.ts'
import { recurringSchema } from '../../../../../../shared/stewardship.ts'
import { recurringTransactions } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { assertRecurringValid, loadRecurring } from '../../../../../lib/recurring.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const input = emptyToNull(await readValidatedBody(event, recurringSchema.parse))

  const id = db.transaction((tx) => {
    assertRecurringValid(tx, input)
    const { id } = tx.insert(recurringTransactions).values(input).returning({ id: recurringTransactions.id }).get()
    recordAudit(tx, { actorUserId: session.user.id, action: 'recurring.create', entityType: 'recurring', entityId: id })
    return id
  })
  setResponseStatus(event, 201)
  return { recurring: loadRecurring().find(item => item.id === id) }
})
