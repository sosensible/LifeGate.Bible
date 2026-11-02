// Enters or clears the keys for the video host and YouTube. They are kept encrypted and are
// never read back (server/lib/integration-secrets.ts).
import { z } from 'zod'
import { INTEGRATION_FIELD_NAMES, integrationView, type IntegrationField } from '../../../lib/integration-secrets.ts'
import { updateVideoSettings } from '../../../lib/video-settings.ts'

// A value to set, or null to clear what was entered here. Left out, or blank, it is unchanged.
const field = z.union([z.string().trim().max(500), z.null()]).optional()
const schema = z.object(Object.fromEntries(INTEGRATION_FIELD_NAMES.map(name => [name, field]))).strict()

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { integrations: ['manage'] })
  const body = await readValidatedBody(event, schema.parse) as Partial<Record<IntegrationField, string | null | undefined>>
  const { disconnected } = updateVideoSettings(body, session.user.id)
  setHeader(event, 'cache-control', 'no-store')
  return { settings: integrationView(), youtubeDisconnected: disconnected }
})
