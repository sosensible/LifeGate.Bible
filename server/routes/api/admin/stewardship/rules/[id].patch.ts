import { eq } from 'drizzle-orm'
import { emptyToNull } from '../../../../../../shared/people.ts'
import { payeeRuleUpdateSchema } from '../../../../../../shared/stewardship.ts'
import { payeeRules } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { changedFields } from '../../../../../lib/stewardship.ts'
import { assertCategoriesExist, loadPayeeRules } from '../../../../../lib/transactions.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const changes = emptyToNull(await readValidatedBody(event, payeeRuleUpdateSchema.parse))

  db.transaction((tx) => {
    const rule = tx.select().from(payeeRules).where(eq(payeeRules.id, id)).get()
    if (!rule) throw createError({ statusCode: 404, statusMessage: 'Rule not found' })
    if (changes.categoryId !== undefined) assertCategoriesExist(tx, [changes.categoryId])
    const fields = changedFields(rule, changes)
    if (!fields.length) return
    tx.update(payeeRules).set(Object.fromEntries(fields.map(field => [field, changes[field]]))).where(eq(payeeRules.id, id)).run()
    recordAudit(tx, { actorUserId: session.user.id, action: 'rule.update', entityType: 'payeeRule', entityId: id, fields })
  })
  return { rule: loadPayeeRules().find(rule => rule.id === id) }
})
