// The church's logo, as the set of PNGs the browser made from one picture. Staff who
// may edit the church's details. Every file is checked, not trusted.
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { MAX_LOGO_SET_BYTES, saveLogoSet } from '../../../../lib/site-logo.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { siteSettings: ['update'] })

  const length = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (length > MAX_LOGO_SET_BYTES + 256 * 1024) throw createError({ statusCode: 413, statusMessage: 'That logo is too large. Try a smaller picture.' })

  const parts = await readMultipartFormData(event)
  const files: Record<string, Uint8Array> = {}
  for (const part of parts ?? []) if (part.name && part.data?.length) files[part.name] = part.data

  const version = saveLogoSet(files)
  recordAudit(db, { actorUserId: session.user.id, action: 'site.logo', entityType: 'site', entityId: 'site', fields: ['logo'] })
  setResponseStatus(event, 201)
  return { logoVersion: version }
})
