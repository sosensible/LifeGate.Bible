// A manual account, e.g. the cash box. Bank accounts arrive through SimpleFIN.
import { emptyToNull } from '../../../../../../shared/people.ts'
import { accountCreateSchema } from '../../../../../../shared/stewardship.ts'
import { financeAccounts } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadAccounts } from '../../../../../lib/stewardship.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const input = emptyToNull(await readValidatedBody(event, accountCreateSchema.parse))

  const id = db.transaction((tx) => {
    const { id } = tx.insert(financeAccounts).values({ ...input, source: 'manual' }).returning({ id: financeAccounts.id }).get()
    recordAudit(tx, { actorUserId: session.user.id, action: 'financeAccount.create', entityType: 'financeAccount', entityId: id })
    return id
  })
  setResponseStatus(event, 201)
  return { account: loadAccounts().find(account => account.id === id) }
})
