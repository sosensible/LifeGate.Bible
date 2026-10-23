// Set or replace a household's photo. Staff only: they keep the household records.
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadHousehold } from '../../../../../lib/households.ts'
import { setHouseholdPhoto } from '../../../../../lib/photos.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  if (!loadHousehold(id)) throw createError({ statusCode: 404, statusMessage: 'Household not found' })

  const photoUrl = setHouseholdPhoto(id, await readUploadedPhoto(event))
  recordAudit(db, { actorUserId: session.user.id, action: 'household.photo', entityType: 'household', entityId: id, fields: ['photo'] })
  setResponseStatus(event, 201)
  return { photoUrl }
})
