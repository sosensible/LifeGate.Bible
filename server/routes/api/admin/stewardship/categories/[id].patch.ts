import { eq } from 'drizzle-orm'
import { categoryUpdateSchema } from '../../../../../../shared/stewardship.ts'
import { categories, ministryCategoryAccess } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { assertNotSystemCategory, changedFields, findCategory, findGroup, loadCategoryGroups } from '../../../../../lib/stewardship.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const { archived, ...changes } = await readValidatedBody(event, categoryUpdateSchema.parse)

  db.transaction((tx) => {
    const category = findCategory(tx, id)
    assertNotSystemCategory(category)
    if (changes.groupId) findGroup(tx, changes.groupId)
    const fields = changedFields(category, changes)
    const archiveChanged = archived !== undefined && archived !== Boolean(category.archivedAt)
    if (!fields.length && !archiveChanged) return

    tx.update(categories).set({
      ...Object.fromEntries(fields.map(field => [field, changes[field]])),
      ...(archiveChanged ? { archivedAt: archived ? new Date() : null } : {}),
    }).where(eq(categories.id, id)).run()
    // A category that becomes sensitive stops showing its ledger to ministries.
    if (changes.isSensitive) {
      tx.update(ministryCategoryAccess).set({ level: 'totals' }).where(eq(ministryCategoryAccess.categoryId, id)).run()
    }
    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'category.update', entityType: 'category', entityId: id, fields })
    if (archiveChanged) recordAudit(tx, { actorUserId: session.user.id, action: archived ? 'category.archive' : 'category.restore', entityType: 'category', entityId: id })
  })
  return { groups: loadCategoryGroups() }
})
