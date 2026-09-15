import { isConfigured, recentSyncRuns } from '../../../../lib/simplefin.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { stewardship: ['view'] })
  return { configured: isConfigured(), runs: recentSyncRuns() }
})
