// Back to the built-in placeholder mark.
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { clearLogo } from '../../../../lib/site-logo.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { siteSettings: ['update'] })
  clearLogo()
  recordAudit(db, { actorUserId: session.user.id, action: 'site.logo', entityType: 'site', entityId: 'site', fields: ['logo'], note: 'removed' })
  setResponseStatus(event, 204)
  return null
})
