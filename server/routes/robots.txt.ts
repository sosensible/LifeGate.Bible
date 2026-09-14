// robots.txt, served dynamically rather than as a static public/robots.txt so the
// Sitemap: hostname comes from the same runtimeConfig.public.siteUrl the sitemap
// itself uses. One source of truth: a `SITE_URL=` build changes both together.
//
// Served live (not prerendered), so the hostname and the indexable flag are
// plain runtime env vars -- see runtimeConfig in nuxt.config.ts.
//
// IMPORTANT: the Disallow rules below are a crawl-hygiene measure, NOT an access
// control. robots.txt is advisory -- well-behaved crawlers honour it, and nothing
// else does. The member-gated routes are still fully rendered by SSR because
// app/middleware/auth.ts bails out on the server (`if (import.meta.server) return`)
// and only redirects after hydration, so `curl /directory` returns the roster HTML.
// That is acceptable while app/data/directory.ts holds demo data; it must be fixed
// with server-side auth before real member data ships. See deploy/README.md.

const DISALLOW = [
  // Member-gated pages (middleware: 'auth').
  '/members',
  '/directory',
  '/calendar',
  '/admin/',
  // No search value, and not meant to be indexed.
  '/login',
  '/api/',
]

export default defineEventHandler((event) => {
  const { siteUrl, indexable } = useRuntimeConfig(event).public
  const origin = String(siteUrl).replace(/\/+$/, '')

  // Preview deployments deliberately still ALLOW crawling. Indexing is refused
  // by the `X-Robots-Tag: noindex` header on every response
  // (server/middleware/noindex.ts); a crawler has to be able to fetch the page
  // to see that. `Disallow: /` here would block the fetch and can leave URLs
  // indexed with no content -- the opposite of what we want. What does change is
  // that we stop advertising a sitemap, since there is nothing to submit.
  const preamble = indexable
    ? []
    : [
        '# Preview deployment -- not the canonical site.',
        '# Indexing is refused via the X-Robots-Tag header on every response.',
        '# Crawling stays allowed so crawlers can actually see that header.',
        '',
      ]

  // In preview mode the Disallow list is not just redundant, it is harmful.
  // X-Robots-Tag already refuses indexing for every path, and these entries
  // additionally block well-behaved automated clients -- including our own
  // tooling -- from fetching /login and /api/*, which is exactly what a preview
  // host needs to be testable. The earlier version emitted this list while the
  // comment above claimed crawling stayed allowed; those contradicted.
  //
  // At launch (indexable), the list returns to keep gated pages out of search.
  const body = [
    ...preamble,
    'User-agent: *',
    'Allow: /',
    '',
    // Longest-match wins for Google, so these override the blanket Allow above.
    ...(indexable ? DISALLOW.map(path => `Disallow: ${path}`) : []),
    ...(indexable ? ['', `Sitemap: ${origin}/sitemap.xml`, ''] : []),
  ].join('\n')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')

  return body
})
