import { statementGiversSchema, type SendStatementsResult } from '../../../../../../../shared/giving.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { renderStatementEmail, sendMail } from '../../../../../../lib/mail.ts'
import { renderStatement, statementFilename } from '../../../../../../lib/statement-pdf.ts'
import { loadStatementSettings, recordDelivery, statementRows, statementsFor } from '../../../../../../lib/statements.ts'

// Emails statements one at a time: the chosen givers, or everyone who gets
// them by email. Givers with no email address are skipped.
export default defineEventHandler(async (event): Promise<SendStatementsResult> => {
  const session = await requirePermission(event, { giving: ['manage'] })
  const year = yearParam(event)
  const { giverIds } = await readValidatedBody(event, statementGiversSchema.parse)
  const { rows } = statementRows(year)
  const chosen = giverIds ? new Set(giverIds) : null
  const selected = rows.filter(row => chosen ? chosen.has(row.giverId) : row.delivery === 'email')
  const withEmail = selected.filter(row => row.email)

  const settings = loadStatementSettings()
  const result: SendStatementsResult = { sent: 0, failed: [], skipped: selected.length - withEmail.length }

  for (const statement of statementsFor(year, withEmail.map(row => row.giverId))) {
    const email = statement.giver.email!
    let error: string | null = null
    try {
      const pdf = await renderStatement(statement, settings)
      const body = renderStatementEmail({ churchName: settings.legalName, statementName: statement.giver.statementName, year, closingMessage: settings.closingMessage })
      await sendMail({
        to: email,
        subject: settings.emailSubject || `Your ${year} contribution statement from ${settings.legalName}`,
        ...body,
        attachments: [{ filename: statementFilename(statement), content: pdf, contentType: 'application/pdf' }],
      })
      result.sent++
    }
    catch (err) {
      error = err instanceof Error ? err.message : 'The statement could not be sent'
      result.failed.push({ giverId: statement.giver.id, statementName: statement.giver.statementName, error })
    }
    recordDelivery(db, { giverId: statement.giver.id, year, method: 'email', sentTo: email, status: error ? 'failed' : 'sent', error, totalCents: statement.totalCents, sentByUserId: session.user.id })
  }

  recordAudit(db, {
    actorUserId: session.user.id,
    action: 'statement.send',
    entityType: 'statement',
    entityId: null,
    note: `${year}: ${result.sent} sent, ${result.failed.length} failed, ${result.skipped} without email`,
  })
  return result
})
