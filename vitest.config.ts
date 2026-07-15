import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // e2e specs boot a real Nuxt server via `setup()` from '@nuxt/test-utils/e2e';
    // booting + first request can be slow, so give them room.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
