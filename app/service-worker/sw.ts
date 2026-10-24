// The service worker, written out rather than generated.
//
// Workbox's generated `navigateFallback` serves one bound document for every
// navigation it matches, whether or not the network is reachable. That is the
// right shape for a single-page app whose shell never changes; this site is
// rendered on the server, so it made every page read "No connection" while the
// site was up and answering. The fallback has to be a last resort instead of a
// first answer, and expressing that needs a worker of our own.
//
// What is kept for reading without a signal is member information: the members
// area, the directory, ministries and the calendar. Those live in caches named
// with the `lifegate-offline-` prefix, which app/utils/offline-cache.ts empties
// the moment somebody signs out or a different person signs in. Nothing else is
// stored, so nothing else has to be cleaned up.
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string, revision: string | null }>
}

// The pages worth reading on a phone with no signal, and the answers they ask
// for once they are running. Both are member information.
const MEMBER_PAGE = /^\/(members|directory|calendar|ministries)(\/|$)/
//
// Ministry lists are deliberately left out. What a person may see of them changes
// the moment the church names a new leader, and an offline copy would go on
// showing a former leader the lists that are now leaders-only. They need a
// connection, and the page asks for them in the browser, never in the
// server-rendered HTML that this worker also stores. The same goes for a
// ministry's notification channels and what its leaders have sent.
const MEMBER_DATA = /^\/api\/(directory|calendar|ministries)(?!\/[^/]+\/(lists|channels|notifications|task-notify))/

// The office and the sign-in flow never get the offline page: a request that
// did not reach the server has to fail visibly rather than look like it worked.
const NO_OFFLINE_PAGE = /^\/(admin|auth)(\/|$)/

const week = 60 * 60 * 24 * 7

// Replaces the old worker as soon as it is downloaded, which is also what gets
// anyone still holding the broken one back onto a working site.
self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Member pages: the network is asked first and only its answer is shown, so a
// connected phone is never served yesterday's copy. The copy is what makes the
// page readable later without a signal.
registerRoute(new NavigationRoute(
  new NetworkFirst({
    cacheName: 'lifegate-offline-pages',
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: week }),
    ],
  }),
  { allowlist: [MEMBER_PAGE] },
))

// Every other page goes straight to the network, exactly as it would with no
// service worker at all. The route exists only so a failure lands in the catch
// handler below and shows the offline page instead of the browser's error.
registerRoute(new NavigationRoute(new NetworkOnly(), { denylist: [NO_OFFLINE_PAGE] }))

registerRoute(
  ({ url, request }) =>
    request.method === 'GET'
    && url.origin === self.location.origin
    && MEMBER_DATA.test(url.pathname),
  new NetworkFirst({
    cacheName: 'lifegate-offline-data',
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: week }),
    ],
  }),
)

// The church's own name and logo. They are chosen after the build, so they cannot
// be precached; they are kept as they are first fetched instead, and the offline
// page (and the header it carries) finds them here with no signal. This is the
// church's public identity, not member information, so these caches do not carry
// the `lifegate-offline-` prefix and are not emptied at sign-out.
//
// A logo's address carries its version, so an old file is never shown for a new
// logo; the settings are re-checked each visit.
const SITE_LOGO = /^\/(site\/(logo|icon)\/|images\/logo-|favicon-|apple-touch-icon|icon-)/

registerRoute(
  ({ url, request }) =>
    request.method === 'GET'
    && url.origin === self.location.origin
    && SITE_LOGO.test(url.pathname),
  new CacheFirst({
    cacheName: 'lifegate-site-logo',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 24 }),
    ],
  }),
)

registerRoute(
  ({ url, request }) =>
    request.method === 'GET'
    && url.origin === self.location.origin
    && url.pathname === '/api/site',
  new StaleWhileRevalidate({
    cacheName: 'lifegate-site-details',
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
)

// Reached only when a route above could not be answered at all -- no network
// and, for a member page, no stored copy either.
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    const offline = await matchPrecache('/offline')
    if (offline) return offline
  }
  return Response.error()
})
