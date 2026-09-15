// Grant, change or remove what one ministry sees of one category.
import { eq } from 'drizzle-orm'
import { ministryAccessSchema } from '../../../../../shared/stewardship.ts'
import { ministries } from '../../../../database/schema/index.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { accessMatrix, setGrant } from '../../../../lib/stewardship-access.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['grantAccess'] })
  const input = await readValidatedBody(event, ministryAccessSchema.parse)

  db.transaction((tx) => {
    const action = setGrant(tx, input, session.user.id)
    if (!action) return
    const ministry = tx.select({ name: ministries.name }).from(ministries).where(eq(ministries.id, input.ministryId)).get()
    recordAudit(tx, {
      actorUserId: session.user.id,
      action,
      entityType: 'category',
      entityId: input.categoryId,
      note: input.level === 'none' ? ministry?.name : `${ministry?.name}: ${input.level}, ${input.audience}`,
    })
  })
  return { matrix: accessMatrix() }
})
