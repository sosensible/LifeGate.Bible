// A new rule also applies to transactions that are still uncategorized.
import { isNull, sql } from 'drizzle-orm'
import { emptyToNull } from '../../../../../../shared/people.ts'
import { payeeRuleSchema } from '../../../../../../shared/stewardship.ts'
import { payeeRules, transactionSplits } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { applyPayeeRules, assertCategoriesExist, loadPayeeRules } from '../../../../../lib/transactions.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const input = emptyToNull(await readValidatedBody(event, payeeRuleSchema.parse))

  const { id, applied } = db.transaction((tx) => {
    assertCategoriesExist(tx, [input.categoryId])
    const next = (tx.select({ max: sql<number | null>`max(${payeeRules.sortOrder})` }).from(payeeRules).get()?.max ?? -1) + 1
    const { id } = tx.insert(payeeRules).values({ ...input, sortOrder: next }).returning({ id: payeeRules.id }).get()
    recordAudit(tx, { actorUserId: session.user.id, action: 'rule.create', entityType: 'payeeRule', entityId: id })

    const uncategorized = tx.selectDistinct({ id: transactionSplits.transactionId }).from(transactionSplits)
      .where(isNull(transactionSplits.categoryId)).all().map(row => row.id)
    return { id, applied: applyPayeeRules(tx, uncategorized) }
  })
  setResponseStatus(event, 201)
  return { rule: loadPayeeRules().find(rule => rule.id === id), applied }
})
