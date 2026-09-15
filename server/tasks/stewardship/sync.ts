// Scheduled bank sync (see scheduledTasks in nuxt.config.ts). Does nothing
// until SIMPLEFIN_ACCESS_URL is set.
import { isConfigured, runSync } from '../../lib/simplefin.ts'

export default defineTask({
  meta: {
    name: 'stewardship:sync',
    description: 'Fetch bank balances and transactions from SimpleFIN',
  },
  async run() {
    if (!isConfigured()) return { result: 'skipped: SimpleFIN is not connected' }
    const run = await runSync()
    if (run.status === 'failed') console.error('[stewardship] bank sync failed:', run.messages.join('; '))
    return { result: run }
  },
})
