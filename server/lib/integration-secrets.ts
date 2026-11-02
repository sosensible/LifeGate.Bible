// Keys and ids for the outside services the site talks to (the church video host, YouTube),
// entered by an administrator on Church details and kept encrypted in the database, so the
// server's environment does not have to carry them. An environment variable still works as a
// fallback, for a server set up that way, but a value entered on Church details wins.
//
// A secret is never sent back to a browser: the screen is only told whether it is set, and
// from where. Ids that are not secret (the video library's number, Google's client id) are
// shown so they can be checked.
import { eq } from 'drizzle-orm'
import { INTEGRATION_FIELD_NAMES, type IntegrationField, type IntegrationView, type SecretSource } from '../../shared/integrations.ts'
import { integrationSecrets } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'
import { decryptToken, encryptToken } from './secret-box.ts'

// Which environment variable is the fallback for each, and whether the value is a secret.
export const INTEGRATION_FIELDS: Record<IntegrationField, { env: string, secret: boolean }> = {
  'bunny.libraryId': { env: 'BUNNY_LIBRARY_ID', secret: false },
  'bunny.apiKey': { env: 'BUNNY_API_KEY', secret: true },
  'bunny.tokenKey': { env: 'BUNNY_TOKEN_KEY', secret: true },
  // Not a secret: the library's address for delivering files, e.g. vz-abc123-xyz.b-cdn.net, used to bring a copy in.
  'bunny.cdnHost': { env: 'BUNNY_CDN_HOST', secret: false },
  'youtube.clientId': { env: 'YOUTUBE_CLIENT_ID', secret: false },
  'youtube.clientSecret': { env: 'YOUTUBE_CLIENT_SECRET', secret: true },
  // Not a secret: a folder on the server where local copies of teaching videos are kept.
  'local.path': { env: 'LOCAL_VIDEO_PATH', secret: false },
}

export { INTEGRATION_FIELD_NAMES }
export type { IntegrationField, IntegrationView, SecretSource }

export const readIntegration = (name: IntegrationField): { value: string | null, source: SecretSource } => {
  const row = db.select().from(integrationSecrets).where(eq(integrationSecrets.name, name)).get()
  if (row) {
    try {
      return { value: decryptToken(row.valueEncrypted), source: 'ui' }
    }
    catch {
      return { value: null, source: 'unreadable' }
    }
  }
  const fromEnv = process.env[INTEGRATION_FIELDS[name].env]?.trim()
  return fromEnv ? { value: fromEnv, source: 'env' } : { value: null, source: null }
}

export const integrationValue = (name: IntegrationField) => readIntegration(name).value

// What a screen may be told: the source of each, and the value only where it is not secret.
export const integrationView = (): IntegrationView =>
  Object.fromEntries(INTEGRATION_FIELD_NAMES.map((name) => {
    const { value, source } = readIntegration(name)
    return [name, { source, value: INTEGRATION_FIELDS[name].secret ? null : value }]
  })) as IntegrationView

// Sets and clears values. A string sets it; null removes what was entered here (a server
// environment value, if any, then applies again); a field left out is unchanged. Returns the
// names that changed, for the audit log, which never records the values.
export const saveIntegrations = (tx: Tx, values: Partial<Record<IntegrationField, string | null>>, userId: string) => {
  const changed: IntegrationField[] = []
  for (const name of INTEGRATION_FIELD_NAMES) {
    const value = values[name]
    if (value === undefined) continue
    if (value === null) {
      if (tx.delete(integrationSecrets).where(eq(integrationSecrets.name, name)).run().changes > 0) changed.push(name)
      continue
    }
    // Saving what is already saved changes nothing, so it does not count (or disconnect anything).
    const existing = tx.select().from(integrationSecrets).where(eq(integrationSecrets.name, name)).get()
    if (existing) {
      try {
        if (decryptToken(existing.valueEncrypted) === value) continue
      }
      catch {
        // Unreadable: saving it again is the fix.
      }
    }
    const encrypted = encryptToken(value)
    tx.insert(integrationSecrets).values({ name, valueEncrypted: encrypted, updatedBy: userId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: integrationSecrets.name, set: { valueEncrypted: encrypted, updatedBy: userId, updatedAt: new Date() } }).run()
    changed.push(name)
  }
  return changed
}
