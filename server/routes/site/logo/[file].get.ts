// The church's logo at one width. Public: it is on every page. If no logo has been
// uploaded, or the file has gone, the built-in mark is the answer.
import { LOGO_WIDTHS, builtInLogo, logoPartName } from '../../../../shared/site-logo.ts'
import { readLogoFile } from '../../../lib/site-logo.ts'

export default defineEventHandler((event) => {
  // Only "<number>.png"; anything else is not one of ours.
  const width = Number(/^(\d+)\.png$/.exec(getRouterParam(event, 'file') ?? '')?.[1])
  if (!(LOGO_WIDTHS as readonly number[]).includes(width)) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const file = readLogoFile(logoPartName(width))
  if (!file) return sendRedirect(event, builtInLogo(width), 302)

  setHeaders(event, {
    'content-type': 'image/png',
    // The address carries the version, so a new logo is a new address and an old
    // one may be kept for a year.
    'cache-control': getQuery(event).v ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  })
  return file
})
