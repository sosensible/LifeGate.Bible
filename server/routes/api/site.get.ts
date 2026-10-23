// The church's name, address, contact details, service times and logo version.
// Public: everything here is already printed on the site.
import { loadSite } from '../../lib/site.ts'

export default defineEventHandler(() => loadSite())
