import { defineConfig } from 'vitest/config'

// Plain Vitest config. @nuxt/test-utils 4 warns against defineVitestConfig for
// e2e specs (it only serves `environment: 'nuxt'` component tests, and none
// exist here). Unit specs import server/shared modules directly.
export default defineConfig({
  test: {
    // e2e specs boot a real Nuxt server via `setup()` from '@nuxt/test-utils/e2e';
    // booting + first request can be slow, so give them room.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
