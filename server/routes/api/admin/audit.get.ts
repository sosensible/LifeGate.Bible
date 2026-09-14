import { auditQuerySchema } from '../../../../shared/audit.ts'
import { auditFilterOptions, queryAudit } from '../../../lib/audit-view.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { audit: ['view'] })
  const query = await getValidatedQuery(event, auditQuerySchema.parse)
  return { ...queryAudit(query), options: auditFilterOptions() }
})
