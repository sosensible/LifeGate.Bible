import { categoryGroupSchema } from '../../../../../../shared/stewardship.ts'
import { categoryGroups } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadCategoryGroups, nextSortOrder } from '../../../../../lib/stewardship.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const input = await readValidatedBody(event, categoryGroupSchema.parse)

  db.transaction((tx) => {
    const { id } = tx.insert(categoryGroups).values({ ...input, sortOrder: nextSortOrder(tx, categoryGroups) }).returning({ id: categoryGroups.id }).get()
    recordAudit(tx, { actorUserId: session.user.id, action: 'categoryGroup.create', entityType: 'categoryGroup', entityId: id })
  })
  setResponseStatus(event, 201)
  return { groups: loadCategoryGroups() }
})
