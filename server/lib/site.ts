// The church's own details, as stored. One row, read fresh each time: a single
// primary-key lookup is far cheaper than a cache that could go stale.
import { eq } from 'drizzle-orm'
import { SITE_DEFAULTS, type SiteInput, type SiteView } from '../../shared/site.ts'
import { siteSettings } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'

const ID = 'site'

const present = (row: typeof siteSettings.$inferSelect): SiteView => ({
  name: row.name,
  shortName: row.shortName,
  description: row.description,
  street: row.street,
  city: row.city,
  region: row.region,
  postalCode: row.postalCode,
  phone: row.phone,
  contactEmail: row.contactEmail,
  serviceTimes: row.serviceTimes,
  logoVersion: row.logoVersion,
  logoWidth: row.logoWidth,
  logoHeight: row.logoHeight,
})

// Never throws. While the site is being built there may be no database, and a
// page must still render, in the neutral defaults, rather than fail to build.
export const loadSite = (): SiteView => {
  try {
    const row = db.select().from(siteSettings).where(eq(siteSettings.id, ID)).get()
    return row ? present(row) : SITE_DEFAULTS
  }
  catch {
    return SITE_DEFAULTS
  }
}

// Writes the text settings. Returns the names of the fields that changed, for the
// audit log (which records which fields, never their values).
export const updateSite = (tx: Tx, input: SiteInput) => {
  const current = loadSite()
  const fields = (Object.keys(input) as Array<keyof SiteInput>)
    .filter(field => JSON.stringify(input[field]) !== JSON.stringify(current[field]))
  if (!fields.length) return fields

  const existing = tx.select({ id: siteSettings.id }).from(siteSettings).where(eq(siteSettings.id, ID)).get()
  if (existing) tx.update(siteSettings).set(input).where(eq(siteSettings.id, ID)).run()
  else tx.insert(siteSettings).values({ id: ID, ...input }).run()
  return fields
}

// Where the contact form's messages go: the address set on /admin/site, else the
// server's CONTACT_EMAIL. Null when neither is set, so the form can say so instead
// of sending to a stranger's address.
export const officeEmail = () => loadSite().contactEmail || process.env.CONTACT_EMAIL || null
