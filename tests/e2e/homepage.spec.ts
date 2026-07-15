import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

// Functional / black-box: we assert what the running site does, not how it does it.
// Runs against the dev server Claude manages on port 3007 (host mode), rather than
// spawning a second production build inside Vitest.
describe('Feature: the public homepage is served', async () => {
  await setup({ host: 'http://127.0.0.1:3007' })

  it('Given the site is running, When I request "/", Then it responds with the hero copy', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('Meets the Word')
  })
})
