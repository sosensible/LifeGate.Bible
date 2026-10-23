// The church's icon at one size (browser tab, iPhone and Android home screens).
// Public. Built-in mark if there is no uploaded one.
import { BUILT_IN_ICONS, ICON_SIZES, iconPartName } from '../../../../shared/site-logo.ts'
import { readLogoFile } from '../../../lib/site-logo.ts'

export default defineEventHandler((event) => {
  // Only "<number>.png"; anything else is not one of ours.
  const size = Number(/^(\d+)\.png$/.exec(getRouterParam(event, 'file') ?? '')?.[1])
  if (!(ICON_SIZES as readonly number[]).includes(size)) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const file = readLogoFile(iconPartName(size))
  if (!file) return sendRedirect(event, BUILT_IN_ICONS[size as keyof typeof BUILT_IN_ICONS], 302)

  setHeaders(event, {
    'content-type': 'image/png',
    'cache-control': getQuery(event).v ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  })
  return file
})
