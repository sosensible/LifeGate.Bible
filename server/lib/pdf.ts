// PDFs with pdfmake: statements and reports. Uses the standard PDF fonts, so
// there are no font files to ship, and loads nothing else from disk or network.
import pdfmake from 'pdfmake'

const STANDARD_FONTS = { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' }
const FONT_NAMES = new Set(Object.values(STANDARD_FONTS))

export const PDF_GREEN = '#1a5c30'
export const PDF_MUTED = '#555555'

let ready = false
const setup = () => {
  if (ready) return
  pdfmake.setUrlAccessPolicy(() => false)
  pdfmake.setLocalAccessPolicy((path: string) => FONT_NAMES.has(path))
  pdfmake.addFonts({ Helvetica: STANDARD_FONTS })
  ready = true
}

// `definition` is a pdfmake document definition; defaultStyle's font is set here.
export const renderPdf = async (definition: Record<string, unknown>): Promise<Buffer> => {
  setup()
  const defaultStyle = { font: 'Helvetica', fontSize: 10, lineHeight: 1.2, ...(definition.defaultStyle as object | undefined) }
  // pdfmake's document definition is loosely typed; callers use its documented format.
  const buffer = await pdfmake.createPdf({ pageSize: 'LETTER', ...definition, defaultStyle } as never).getBuffer()
  return Buffer.from(buffer)
}

// "Sep 15, 2026" from YYYY-MM-DD, without time zone drift.
export const pdfDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
