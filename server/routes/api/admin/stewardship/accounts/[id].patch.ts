import { eq } from 'drizzle-orm'
import { emptyToNull } from '../../../../../../shared/people.ts'
import { accountUpdateSchema } from '../../../../../../shared/stewardship.ts'
import { financeAccounts } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { changedFields, findAccount, loadAccounts } from '../../../../../lib/stewardship.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const { archived, ...changes } = emptyToNull(await readValidatedBody(event, accountUpdateSchema.parse))

  db.transaction((tx) => {
    const account = findAccount(tx, id)
    const fields = changedFields(account, changes)
    if (fields.includes('openingBalanceCents') && account.source !== 'manual') {
      throw createError({ statusCode: 400, statusMessage: 'The bank reports this account’s balance' })
    }
    const archiveChanged = archived !== undefined && archived !== Boolean(account.archivedAt)
    if (!fields.length && !archiveChanged) return

    tx.update(financeAccounts).set({
      ...Object.fromEntries(fields.map(field => [field, changes[field]])),
      ...(archiveChanged ? { archivedAt: archived ? new Date() : null } : {}),
    }).where(eq(financeAccounts.id, id)).run()

    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'financeAccount.update', entityType: 'financeAccount', entityId: id, fields })
    if (archiveChanged) recordAudit(tx, { actorUserId: session.user.id, action: archived ? 'financeAccount.archive' : 'financeAccount.restore', entityType: 'financeAccount', entityId: id })
  })
  return { account: loadAccounts().find(account => account.id === id) }
})
