import { printQuerySchema } from '../../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { renderStatements } from '../../../../../../lib/statement-pdf.ts'
import { loadStatementSettings, recordDelivery, statementRows, statementsFor } from '../../../../../../lib/statements.ts'

// One PDF for printing: the chosen givers, or everyone who gets statements by mail.
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['view'] })
  const year = yearParam(event)
  const query = await getValidatedQuery(event, printQuerySchema.parse)
  const { rows } = statementRows(year)
  const chosen = query.giverIds ? new Set(query.giverIds.split(',').filter(Boolean)) : null
  const selected = rows.filter(row => chosen ? chosen.has(row.giverId) : row.delivery === 'mail' || !row.email)
  if (!selected.length) throw createError({ statusCode: 404, statusMessage: 'No statements to print for that year' })

  const statements = statementsFor(year, selected.map(row => row.giverId))
  const pdf = await renderStatements(statements, loadStatementSettings())

  db.transaction((tx) => {
    for (const statement of statements) {
      recordDelivery(tx, { giverId: statement.giver.id, year, method: 'print', sentTo: null, status: 'sent', error: null, totalCents: statement.totalCents, sentByUserId: session.user.id })
    }
    recordAudit(tx, { actorUserId: session.user.id, action: 'statement.print', entityType: 'statement', entityId: null, note: `${year}: ${statements.length} statement${statements.length === 1 ? '' : 's'}` })
  })

  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${year}-contribution-statements.pdf"`,
    'Cache-Control': 'no-store',
  })
  return pdf
})
