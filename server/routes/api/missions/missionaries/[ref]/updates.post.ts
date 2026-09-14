// Add a prayer request or prayer letter to a missionary.
import { eq } from 'drizzle-orm'
import { missionUpdateSchema } from '../../../../../../shared/missions.ts'
import { emptyToNull } from '../../../../../../shared/people.ts'
import { missionaries, missionUpdates } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadMissionaries } from '../../../../../lib/missions.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireMissionsEditor(event)
  const id = getRouterParam(event, 'ref')!
  if (!db.select({ id: missionaries.id }).from(missionaries).where(eq(missionaries.id, id)).get()) {
    throw createError({ statusCode: 404, statusMessage: 'Missionary not found' })
  }

  const values = emptyToNull(await readValidatedBody(event, missionUpdateSchema.parse))
  db.transaction((tx) => {
    tx.insert(missionUpdates).values({ ...values, missionaryId: id }).run()
    recordAudit(tx, { actorUserId: viewer.session.user.id, action: `missionary.${values.kind === 'prayer' ? 'prayerRequest' : 'letter'}`, entityType: 'missionary', entityId: id })
  })

  setResponseStatus(event, 201)
  return { missionary: loadMissionaries({ canEdit: true, id })[0] }
})
