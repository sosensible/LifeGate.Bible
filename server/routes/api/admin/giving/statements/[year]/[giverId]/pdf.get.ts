import { renderStatement, statementFilename } from '../../../../../../../lib/statement-pdf.ts'
import { loadStatementSettings, statementFor } from '../../../../../../../lib/statements.ts'

// A preview: opens in the browser, and is not recorded as sent.
export default defineEventHandler(async (event) => {
  await requirePermission(event, { giving: ['view'] })
  const statement = statementFor(yearParam(event), getRouterParam(event, 'giverId')!)
  const pdf = await renderStatement(statement, loadStatementSettings())
  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${statementFilename(statement)}"`,
    'Cache-Control': 'no-store',
  })
  return pdf
})
