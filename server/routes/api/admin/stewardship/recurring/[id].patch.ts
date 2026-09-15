// Edit a recurring transaction, or archive/restore it with `archived`.
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { emptyToNull } from '../../../../../../shared/people.ts'
import { recurringSchema } from '../../../../../../shared/stewardship.ts'
import { recurringTransactions } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { assertRecurringValid, loadRecurring } from '../../../../../lib/recurring.ts'
import { changedFields } from '../../../../../lib/stewardship.ts'

// The whole item is sent (its rules depend on each other), plus `archived`.
const bodySchema = z.object({ archived: z.boolean().optional() }).and(recurringSchema)

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const { archived, ...input } = emptyToNull(await readValidatedBody(event, bodySchema.parse))

  db.transaction((tx) => {
    const current = tx.select().from(recurringTransactions).where(eq(recurringTransactions.id, id)).get()
    if (!current) throw createError({ statusCode: 404, statusMessage: 'Recurring transaction not found' })
    assertRecurringValid(tx, input)
    const fields = changedFields(current, input)
    const archiveChanged = archived !== undefined && archived !== Boolean(current.archivedAt)
    if (!fields.length && !archiveChanged) return

    tx.update(recurringTransactions).set({
      ...Object.fromEntries(fields.map(field => [field, input[field as keyof typeof input]])),
      ...(archiveChanged ? { archivedAt: archived ? new Date() : null } : {}),
    }).where(eq(recurringTransactions.id, id)).run()
    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'recurring.update', entityType: 'recurring', entityId: id, fields })
    if (archiveChanged) recordAudit(tx, { actorUserId: session.user.id, action: archived ? 'recurring.archive' : 'recurring.restore', entityType: 'recurring', entityId: id })
  })
  return { recurring: loadRecurring().find(item => item.id === id) }
})
