import { categorySchema } from '../../../../../../shared/stewardship.ts'
import { categories } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { findGroup, loadCategoryGroups, nextSortOrder } from '../../../../../lib/stewardship.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  const input = await readValidatedBody(event, categorySchema.parse)

  db.transaction((tx) => {
    findGroup(tx, input.groupId)
    const { id } = tx.insert(categories).values({ ...input, sortOrder: nextSortOrder(tx, categories, input.groupId) }).returning({ id: categories.id }).get()
    recordAudit(tx, { actorUserId: session.user.id, action: 'category.create', entityType: 'category', entityId: id })
  })
  setResponseStatus(event, 201)
  return { groups: loadCategoryGroups() }
})
