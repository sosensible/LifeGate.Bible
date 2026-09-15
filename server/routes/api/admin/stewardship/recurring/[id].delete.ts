// Remove a recurring transaction. Transactions it matched or entered stay.
import { eq } from 'drizzle-orm'
import { categories, recurringTransactions } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const removed = db.transaction((tx) => {
    const row = tx.delete(recurringTransactions).where(eq(recurringTransactions.id, id)).returning({ name: recurringTransactions.name, categoryId: recurringTransactions.categoryId }).get()
    // The name is kept in the note (the row is gone) unless its category is sensitive.
    const sensitive = row?.categoryId && tx.select({ isSensitive: categories.isSensitive }).from(categories).where(eq(categories.id, row.categoryId)).get()?.isSensitive
    if (row) recordAudit(tx, { actorUserId: session.user.id, action: 'recurring.delete', entityType: 'recurring', entityId: id, note: sensitive ? undefined : row.name })
    return row
  })
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Recurring transaction not found' })
  setResponseStatus(event, 204)
  return null
})
