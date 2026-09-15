// Daily: enter due recurring transactions in their manual accounts (see
// scheduledTasks in nuxt.config.ts and server/lib/recurring.ts).
import { autoEnterDue } from '../../lib/recurring.ts'

export default defineTask({
  meta: {
    name: 'stewardship:recurring',
    description: 'Enter due recurring transactions in manual accounts',
  },
  run() {
    const entered = autoEnterDue()
    return { result: { entered: entered.length } }
  },
})
