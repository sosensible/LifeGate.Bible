// Semi-annual reports as PDF and CSV. Totals only in the PDF; the CSV can add
// month-by-month activity and the transactions behind it.
import Papa from 'papaparse'
import { formatCents } from '../../shared/money.ts'
import { monthLabel, type ReportTotals, type ReportTransaction, type SemiAnnualReport } from '../../shared/stewardship.ts'
import { PDF_GREEN, PDF_MUTED, renderPdf } from './pdf.ts'

const money = (cents: number, bold = false) => ({ text: formatCents(cents), alignment: 'right', bold })

const categoryColumns = (report: SemiAnnualReport) => [
  { key: 'carriedInCents', label: 'Carried in' },
  { key: 'fundedCents', label: 'Funded' },
  { key: 'activityCents', label: 'Activity' },
  ...(report.showReturned ? [{ key: 'returnedCents', label: 'Returned' }] : []),
  { key: 'remainingCents', label: 'Remaining' },
] as Array<{ key: keyof Omit<ReportTotals, 'monthlyActivityCents'>, label: string }>

export const renderReportPdf = (report: SemiAnnualReport, churchName: string, generatedOn: Date = new Date()) => {
  const columns = categoryColumns(report)
  const header = (first: string) => [
    { text: first, bold: true },
    ...columns.map(c => ({ text: c.label, bold: true, alignment: 'right' })),
  ]
  const widths = ['*', ...columns.map(() => 'auto')]
  const s = report.summary
  const summaryRows: Array<[string, number, boolean?]> = [
    ['Cash at start', s.cashStartCents, true],
    ['Undesignated offerings', s.undesignatedOfferingsCents],
    ['Designated offerings', s.designatedOfferingsCents],
    ['Other money in', s.otherInCents],
    ['Money out', s.outCents],
    ...(s.transfersCents ? [['Transfers to or from other accounts', s.transfersCents] as [string, number]] : []),
    ...(s.uncategorizedCents ? [['Not yet categorized', s.uncategorizedCents] as [string, number]] : []),
    ['Cash at end', s.cashEndCents, true],
  ]
  const generated = generatedOn.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return renderPdf({
    pageMargins: [54, 54, 54, 54],
    info: { title: `Semi-annual report, ${report.label}`, author: churchName },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `Generated ${generated}`, fontSize: 8, color: PDF_MUTED },
        { text: `Page ${page} of ${pages}`, fontSize: 8, color: PDF_MUTED, alignment: 'right' },
      ],
      margin: [54, 20, 54, 0],
    }),
    content: [
      { text: churchName, fontSize: 16, bold: true, color: PDF_GREEN },
      { text: `Semi-annual report: ${report.label}${report.toDate ? ' (to date)' : ''}`, fontSize: 12, bold: true, margin: [0, 2, 0, 16] },
      ...(report.uncategorizedCount
        ? [{ text: `${report.uncategorizedCount} transaction${report.uncategorizedCount === 1 ? ' is' : 's are'} not yet categorized; these figures may change.`, italics: true, color: PDF_MUTED, margin: [0, 0, 0, 8] }]
        : []),
      { text: 'Cash', fontSize: 12, bold: true, margin: [0, 0, 0, 4] },
      {
        table: {
          widths: ['*', 'auto'],
          body: summaryRows.map(([label, cents, bold]) => [{ text: label, bold: Boolean(bold) }, money(cents, Boolean(bold))]),
        },
        layout: 'lightHorizontalLines',
      },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            ['Available to Fund at start', money(s.availableToFundStartCents)],
            ['Available to Fund at end', money(s.availableToFundEndCents)],
          ],
        },
        layout: 'noBorders',
        margin: [0, 6, 0, 18],
      },
      ...report.groups.flatMap(group => [
        { text: group.name, fontSize: 12, bold: true, margin: [0, 6, 0, 4] },
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths,
            body: [
              header(group.reportDetail === 'total' ? 'Reported as a group total' : 'Category'),
              ...group.categories.map(row => [row.name, ...columns.map(c => money(row[c.key]))]),
              [{ text: `${group.name} total`, bold: true }, ...columns.map(c => money(group.totals[c.key], true))],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 10],
        },
      ]),
      {
        table: {
          widths,
          body: [
            header('All categories'),
            [{ text: 'Total', bold: true }, ...columns.map(c => money(report.totals[c.key], true))],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 8, 0, 0],
      },
      ...(report.showReturned
        ? [{ text: 'Returned: what categories that reset each month gave back to Available to Fund.', fontSize: 8, color: PDF_MUTED, margin: [0, 8, 0, 0] }]
        : []),
    ],
  })
}

const dollars = (cents: number) => cents / 100

// Text from the bank or typed by people is escaped so a spreadsheet never runs it as a formula.
const toCsv = (rows: Array<Array<string | number | null>>) => Papa.unparse(rows, { escapeFormulae: true })

export const renderReportCsv = (report: SemiAnnualReport) => {
  const monthHeaders = report.months.map(m => monthLabel(m))
  const line = (group: string, category: string, t: ReportTotals) => [
    group, category, dollars(t.carriedInCents), dollars(t.fundedCents),
    ...t.monthlyActivityCents.map(dollars), dollars(t.activityCents), dollars(t.returnedCents), dollars(t.remainingCents),
  ]
  const s = report.summary
  return toCsv([
    [`Semi-annual report: ${report.label}${report.toDate ? ' (to date)' : ''}`],
    [],
    ['Group', 'Category', 'Carried in', 'Funded', ...monthHeaders.map(m => `Activity ${m}`), 'Activity total', 'Returned', 'Remaining'],
    ...report.groups.flatMap(group => [
      ...group.categories.map(row => line(group.name, row.name, row)),
      line(group.name, `${group.name} total`, group.totals),
    ]),
    line('', 'All categories total', report.totals),
    [],
    ['Cash', 'Amount'],
    ['Cash at start', dollars(s.cashStartCents)],
    ['Undesignated offerings', dollars(s.undesignatedOfferingsCents)],
    ['Designated offerings', dollars(s.designatedOfferingsCents)],
    ['Other money in', dollars(s.otherInCents)],
    ['Money out', dollars(s.outCents)],
    ['Transfers to or from other accounts', dollars(s.transfersCents)],
    ['Not yet categorized', dollars(s.uncategorizedCents)],
    ['Cash at end', dollars(s.cashEndCents)],
    ['Available to Fund at start', dollars(s.availableToFundStartCents)],
    ['Available to Fund at end', dollars(s.availableToFundEndCents)],
  ])
}

export const renderTransactionsCsv = (transactions: ReportTransaction[]) => toCsv([
  ['Date', 'Account', 'Group', 'Category', 'Payee', 'Memo', 'Amount', 'Transfer'],
  ...transactions.map(t => [
    t.postedOn,
    t.account,
    t.group,
    t.isTransfer ? 'Transfer' : t.category ?? 'Uncategorized',
    t.payee,
    t.memo,
    dollars(t.amountCents),
    t.isTransfer ? 'Yes' : '',
  ]),
])

// "lifegate-2027-jan-jun-report"
export const reportFilename = (report: SemiAnnualReport) =>
  `lifegate-${report.period.year}-${report.period.half === 1 ? 'jan-jun' : 'jul-dec'}-report`
