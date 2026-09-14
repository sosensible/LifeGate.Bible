// Browser-side Better Auth client. Auto-imported as `authClient`.
import { createAuthClient } from 'better-auth/vue'
import { adminClient, magicLinkClient } from 'better-auth/client/plugins'
import { ac, roles } from '#shared/auth/permissions'

export const authClient = createAuthClient({
  plugins: [
    adminClient({ ac, roles }),
    magicLinkClient(),
  ],
})
