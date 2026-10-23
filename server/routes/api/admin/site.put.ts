// The office edits the church's details. Administrators and the church secretary.
import { siteSchema } from '../../../../shared/site.ts'
import { recordAudit } from '../../../lib/audit.ts'
import { db } from '../../../lib/db.ts'
import { loadSite, updateSite } from '../../../lib/site.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { siteSettings: ['update'] })
  const input = await readValidatedBody(event, siteSchema.parse)

  db.transaction((tx) => {
    const fields = updateSite(tx, input)
    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'site.update', entityType: 'site', entityId: 'site', fields })
  })
  return loadSite()
})
