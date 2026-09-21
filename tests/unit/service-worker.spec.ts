// The service worker's routing table.
//
// This exists because of a bug that shipped through a build check: Workbox's
// generated `navigateFallback` answers every navigation it matches with the
// offline page, reachable network or not, and on a server-rendered site that
// means every page reads "No connection". The build artifact looked correct --
// the precache list, the cache names and the denylist were all as intended --
// so nothing short of asking what each route actually does would have caught
// it. That is what these tests ask.
import { beforeAll, describe, expect, it, vi } from 'vitest'

type Registered = [unknown, unknown]

const registered: Registered[] = []
let catchHandler: ((opts: { request: Request }) => Promise<Response>) | null = null

class FakeNavigationRoute {
  readonly kind = 'navigation'
  constructor(readonly handler: { strategy: string }, readonly options: { allowlist?: RegExp[], denylist?: RegExp[] } = {}) {}
}

vi.mock('workbox-routing', () => ({
  registerRoute: (...args: Registered) => void registered.push(args),
  setCatchHandler: (handler: never) => { catchHandler = handler },
  NavigationRoute: FakeNavigationRoute,
}))
vi.mock('workbox-strategies', () => ({
  NetworkFirst: class { readonly strategy = 'NetworkFirst'; constructor(readonly options: { cacheName?: string } = {}) {} },
  NetworkOnly: class { readonly strategy = 'NetworkOnly'; constructor(readonly options = {}) {} },
}))
vi.mock('workbox-precaching', () => ({
  precacheAndRoute: vi.fn(),
  cleanupOutdatedCaches: vi.fn(),
  matchPrecache: vi.fn(async (url: string) =>
    url === '/offline' ? new Response('<title>No connection</title>') : undefined),
}))
vi.mock('workbox-core', () => ({ clientsClaim: vi.fn() }))
vi.mock('workbox-expiration', () => ({ ExpirationPlugin: class { constructor(readonly o: unknown) {} } }))
vi.mock('workbox-cacheable-response', () => ({ CacheableResponsePlugin: class { constructor(readonly o: unknown) {} } }))

const ORIGIN = 'https://new.lifegate.bible'

beforeAll(async () => {
  vi.stubGlobal('self', {
    skipWaiting: vi.fn(),
    __WB_MANIFEST: [],
    location: { origin: ORIGIN },
  })
  await import('../../app/service-worker/sw')
})

const navigationRoutes = () =>
  registered.map(([route]) => route).filter((r): r is FakeNavigationRoute => r instanceof FakeNavigationRoute)

const routeFor = (path: string) =>
  navigationRoutes().find((route) => {
    const { allowlist, denylist } = route.options
    if (allowlist && !allowlist.some(re => re.test(path))) return false
    if (denylist && denylist.some(re => re.test(path))) return false
    return true
  })

describe('navigating while online', () => {
  // The regression itself. A navigation must be answered by the network, never
  // by a handler bound to the offline document.
  it.each(['/', '/about', '/teaching', '/giving'])('sends %s to the network', (path) => {
    expect(routeFor(path)?.handler.strategy).toBe('NetworkOnly')
  })

  it.each(['/members', '/directory', '/calendar', '/ministries/youth'])(
    'tries the network first for %s, and stores what comes back',
    (path) => {
      const route = routeFor(path)
      expect(route?.handler.strategy).toBe('NetworkFirst')
      expect((route?.handler as { options: { cacheName: string } }).options.cacheName).toBe('lifegate-offline-pages')
    },
  )

  it('answers no navigation from the precache', () => {
    // `createHandlerBoundToURL` is what made every page read "No connection".
    expect(navigationRoutes().map(r => r.handler.strategy)).not.toContain('PrecacheOnly')
    expect(navigationRoutes().every(r => ['NetworkOnly', 'NetworkFirst'].includes(r.handler.strategy))).toBe(true)
  })
})

describe('what may fall back to the offline page', () => {
  it.each(['/admin', '/admin/accounts', '/auth/login'])('leaves %s to fail visibly', (path) => {
    // The office and the sign-in flow must not look like they worked.
    expect(routeFor(path)).toBeUndefined()
  })

  // `mode` is read-only on a real Request and the constructor refuses
  // "navigate", so the worker is handed the one field it reads.
  const asRequest = (mode: string) => ({ request: { mode } as Request })

  it('shows the offline page when a navigation cannot be answered at all', async () => {
    const response = await catchHandler!(asRequest('navigate'))
    await expect(response.text()).resolves.toContain('No connection')
  })

  it('does not hand the offline page to anything but a navigation', async () => {
    const response = await catchHandler!(asRequest('cors'))
    expect(response.type).toBe('error')
  })
})

describe('the answers member pages ask for', () => {
  const dataRoute = () => registered.find(([match]) => typeof match === 'function')?.[0] as
    (opts: { url: URL, request: { method: string } }) => boolean

  const matches = (url: string, method = 'GET') =>
    dataRoute()({ url: new URL(url), request: { method } })

  it('stores the directory, calendar and ministry answers', () => {
    expect(matches(`${ORIGIN}/api/directory`)).toBe(true)
    expect(matches(`${ORIGIN}/api/calendar`)).toBe(true)
    expect(matches(`${ORIGIN}/api/ministries/youth`)).toBe(true)
  })

  it('leaves everything else alone', () => {
    expect(matches(`${ORIGIN}/api/admin/accounts`)).toBe(false)
    expect(matches(`${ORIGIN}/api/stewardship/offerings`)).toBe(false)
  })

  it('never stores a change, only a read', () => {
    expect(matches(`${ORIGIN}/api/directory`, 'POST')).toBe(false)
  })

  it('ignores another site’s answers', () => {
    expect(matches('https://example.com/api/directory')).toBe(false)
  })
})
