// "Sync now". Limited to once every 30 minutes; the schedule covers the rest.
import { runSync } from '../../../../lib/simplefin.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['manage'] })
  return { run: await runSync({ triggeredByUserId: session.user.id }) }
})
