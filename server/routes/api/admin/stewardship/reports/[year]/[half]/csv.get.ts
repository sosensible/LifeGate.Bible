import { recordAudit } from '../../../../../../../lib/audit.ts'
import { db } from '../../../../../../../lib/db.ts'
import { renderReportCsv, renderTransactionsCsv, reportFilename } from '../../../../../../../lib/report-pdf.ts'
import { reportTransactions, semiAnnualReport } from '../../../../../../../lib/reports.ts'

// ?detail=transactions for the lines behind the report instead of the summary.
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['view'] })
  const period = reportPeriodParam(event)
  const report = semiAnnualReport(period)
  const withTransactions = getQuery(event).detail === 'transactions'
  const csv = withTransactions ? renderTransactionsCsv(reportTransactions(period)) : renderReportCsv(report)
  recordAudit(db, { actorUserId: session.user.id, action: 'report.export', entityType: 'report', entityId: null, note: `${report.label}, CSV${withTransactions ? ' with transactions' : ''}` })
  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${reportFilename(report)}${withTransactions ? '-transactions' : ''}.csv"`,
    'Cache-Control': 'no-store',
  })
  // A byte-order mark so Excel reads the dashes and curly quotes as UTF-8.
  return `﻿${csv}`
})
