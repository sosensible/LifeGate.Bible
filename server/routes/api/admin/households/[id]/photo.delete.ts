// Remove a household's photo.
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadHousehold } from '../../../../../lib/households.ts'
import { clearHouseholdPhoto } from '../../../../../lib/photos.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  if (!loadHousehold(id)) throw createError({ statusCode: 404, statusMessage: 'Household not found' })

  clearHouseholdPhoto(id)
  recordAudit(db, { actorUserId: session.user.id, action: 'household.photo', entityType: 'household', entityId: id, fields: ['photo'], note: 'removed' })
  setResponseStatus(event, 204)
  return null
})
