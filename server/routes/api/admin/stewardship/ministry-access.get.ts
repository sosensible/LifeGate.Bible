// Ministries, categories and grants: names only, never amounts.
import { accessMatrix } from '../../../../lib/stewardship-access.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { stewardship: ['grantAccess'] })
  return { matrix: accessMatrix() }
})
