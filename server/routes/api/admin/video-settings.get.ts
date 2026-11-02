// What is set for the video host and YouTube, and from where. Secrets are never included.
import { integrationView } from '../../../lib/integration-secrets.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { integrations: ['manage'] })
  setHeader(event, 'cache-control', 'no-store')
  return integrationView()
})
