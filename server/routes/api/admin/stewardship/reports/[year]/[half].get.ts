import { semiAnnualReport } from '../../../../../../lib/reports.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { stewardship: ['view'] })
  return semiAnnualReport(reportPeriodParam(event))
})
