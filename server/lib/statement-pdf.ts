// Giving statements as PDF, one renderer for printing and email attachments.
import { formatCents } from '../../shared/money.ts'
import { GIFT_METHOD_LABELS, IRS_ACKNOWLEDGMENT, UNDESIGNATED_LABEL, type StatementSettingsView, type StatementView } from '../../shared/giving.ts'
import { PDF_GREEN, PDF_MUTED, pdfDate, renderPdf } from './pdf.ts'

const lines = (text: string | null | undefined) => (text ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)

const statementContent = (statement: StatementView, settings: StatementSettingsView, pageBreak: boolean) => {
  const methodText = (gift: StatementView['gifts'][number]) =>
    gift.method === 'check' && gift.checkNumber ? `Check #${gift.checkNumber}` : GIFT_METHOD_LABELS[gift.method]
  const designated = statement.designations.some(line => line.givenTo !== UNDESIGNATED_LABEL)

  return [
    // Letterhead.
    {
      columns: [
        {
          stack: [
            { text: settings.legalName, fontSize: 16, bold: true, color: PDF_GREEN },
            ...lines(settings.mailingAddress).map(line => ({ text: line, fontSize: 9, color: PDF_MUTED })),
            ...(settings.ein ? [{ text: `EIN ${settings.ein}`, fontSize: 9, color: PDF_MUTED }] : []),
          ],
        },
        { text: `${statement.year} Contribution Statement`, alignment: 'right', fontSize: 12, bold: true, margin: [0, 4, 0, 0] },
      ],
      ...(pageBreak ? { pageBreak: 'before' } : {}),
    },
    // Recipient block, placed for a #10 window envelope.
    {
      absolutePosition: { x: 72, y: 150 },
      stack: [
        { text: statement.giver.statementName, fontSize: 11 },
        ...lines(statement.giver.mailingAddress).map(line => ({ text: line, fontSize: 11 })),
      ],
    },
    { text: '', margin: [0, 110, 0, 0] },
    {
      text: `Contributions received January 1 through December 31, ${statement.year}`,
      bold: true,
      margin: [0, 0, 0, 8],
    },
    {
      table: {
        headerRows: 1,
        // "Given to" only when something was designated.
        widths: designated ? ['auto', '*', 'auto', 'auto'] : ['auto', '*', 'auto'],
        body: [
          [
            { text: 'Date', bold: true },
            ...(designated ? [{ text: 'Given to', bold: true }] : []),
            { text: 'Method', bold: true },
            { text: 'Amount', bold: true, alignment: 'right' },
          ],
          ...statement.gifts.map(gift => [
            pdfDate(gift.receivedOn),
            ...(designated ? [gift.givenTo] : []),
            methodText(gift),
            { text: formatCents(gift.amountCents), alignment: 'right' },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 10,
    },
    {
      margin: [0, 12, 0, 0],
      table: {
        widths: ['*', 'auto'],
        body: [
          ...(statement.designations.length > 1
            ? statement.designations.map(line => [{ text: line.givenTo, alignment: 'right' }, { text: formatCents(line.amountCents), alignment: 'right' }])
            : []),
          [{ text: 'Total contributions', bold: true, alignment: 'right' }, { text: formatCents(statement.totalCents), bold: true, alignment: 'right' }],
        ],
      },
      layout: 'noBorders',
      fontSize: 10,
    },
    { text: IRS_ACKNOWLEDGMENT, margin: [0, 20, 0, 0], fontSize: 10 },
    ...(settings.closingMessage ? [{ text: settings.closingMessage, margin: [0, 12, 0, 0], fontSize: 10 }] : []),
    ...(settings.signerName
      ? [{
          margin: [0, 24, 0, 0],
          stack: [
            { text: settings.signerName, fontSize: 10 },
            ...(settings.signerTitle ? [{ text: settings.signerTitle, fontSize: 9, color: PDF_MUTED }] : []),
          ],
        }]
      : []),
    { text: 'Please keep this statement for your tax records.', margin: [0, 20, 0, 0], fontSize: 9, italics: true, color: PDF_MUTED },
  ]
}

const render = (statements: StatementView[], settings: StatementSettingsView) => renderPdf({
  pageMargins: [72, 54, 72, 54],
  info: { title: statements.length === 1 ? `${statements[0]!.year} Contribution Statement` : 'Contribution Statements', author: settings.legalName },
  content: statements.flatMap((statement, index) => statementContent(statement, settings, index > 0)),
})

export const renderStatement = (statement: StatementView, settings: StatementSettingsView) => render([statement], settings)

// One PDF with each giver's statement starting on a new page, for printing.
export const renderStatements = (statements: StatementView[], settings: StatementSettingsView) => render(statements, settings)

export const statementFilename = (statement: StatementView) =>
  `${statement.year}-contribution-statement-${statement.giver.statementName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'giver'}.pdf`
