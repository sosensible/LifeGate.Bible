// Some browsers ask for /favicon.ico whatever the page says. Send them to the
// church's tab icon: its own if it has uploaded one, the built-in mark if not.
import { BUILT_IN_ICONS, uploadedIcon } from '../../shared/site-logo.ts'
import { loadSite } from '../lib/site.ts'

export default defineEventHandler((event) => {
  const { logoVersion } = loadSite()
  return sendRedirect(event, logoVersion > 0 ? uploadedIcon(48, logoVersion) : BUILT_IN_ICONS[48], 302)
})
