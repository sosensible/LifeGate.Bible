import { eq } from 'drizzle-orm'
import { categoryGroupUpdateSchema } from '../../../../../../shared/stewardship.ts'
import { categoryGroups } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { changedFields, findGroup, loadCategoryGroups } from '../../../../../lib/stewardship.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const id = getRouterParam(event, 'id')!
  const { archived, ...changes } = await readValidatedBody(event, categoryGroupUpdateSchema.parse)

  db.transaction((tx) => {
    const group = findGroup(tx, id)
    const fields = changedFields(group, changes)
    const archiveChanged = archived !== undefined && archived !== Boolean(group.archivedAt)
    if (!fields.length && !archiveChanged) return

    tx.update(categoryGroups).set({
      ...Object.fromEntries(fields.map(field => [field, changes[field]])),
      ...(archiveChanged ? { archivedAt: archived ? new Date() : null } : {}),
    }).where(eq(categoryGroups.id, id)).run()
    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'categoryGroup.update', entityType: 'categoryGroup', entityId: id, fields })
    if (archiveChanged) recordAudit(tx, { actorUserId: session.user.id, action: archived ? 'categoryGroup.archive' : 'categoryGroup.restore', entityType: 'categoryGroup', entityId: id })
  })
  return { groups: loadCategoryGroups() }
})
