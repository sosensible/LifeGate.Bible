import { recordAudit } from '../../../../../../../lib/audit.ts'
import { db } from '../../../../../../../lib/db.ts'
import { renderReportPdf, reportFilename } from '../../../../../../../lib/report-pdf.ts'
import { semiAnnualReport } from '../../../../../../../lib/reports.ts'
import { loadStatementSettings } from '../../../../../../../lib/statements.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { stewardship: ['view'] })
  const report = semiAnnualReport(reportPeriodParam(event))
  const pdf = await renderReportPdf(report, loadStatementSettings().legalName)
  recordAudit(db, { actorUserId: session.user.id, action: 'report.export', entityType: 'report', entityId: null, note: `${report.label}, PDF` })
  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${reportFilename(report)}.pdf"`,
    'Cache-Control': 'no-store',
  })
  return pdf
})
