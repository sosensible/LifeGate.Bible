import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// A throwaway database (uploads are kept beside it) for any spec that imports server code
// without choosing its own, so a test can never read or write the developer's
// real `.data`. Specs that need a migrated database still set DATABASE_PATH themselves.
const scratch = mkdtempSync(join(tmpdir(), 'lifegate-vitest-'))

// Plain Vitest config. @nuxt/test-utils 4 warns against defineVitestConfig for
// e2e specs (it only serves `environment: 'nuxt'` component tests, and none
// exist here). Unit specs import server/shared modules directly.
export default defineConfig({
  test: {
    // e2e specs boot a real Nuxt server via `setup()` from '@nuxt/test-utils/e2e';
    // booting + first request can be slow, so give them room.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_PATH: join(scratch, 'default.db'),
    },
  },
})
