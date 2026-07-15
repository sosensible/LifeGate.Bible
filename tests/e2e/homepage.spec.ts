import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

// Functional / black-box: assert what the running site does, not how.
// Runs against the dev server Claude manages on port 3007 (host mode).
describe('Feature: the public homepage', async () => {
  await setup({ host: 'http://127.0.0.1:3007' })

  it('Given the site is running, When I request "/", Then it responds with the hero copy', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('Meets the Word')
  })
})
