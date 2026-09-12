// robots.txt, served dynamically rather than as a static public/robots.txt so the
// Sitemap: hostname comes from the same runtimeConfig.public.siteUrl the sitemap
// itself uses. One source of truth: a `SITE_URL=` build changes both together.
//
// Prerendered alongside /sitemap.xml, so this is fixed at BUILD time.
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
  const siteUrl = useRuntimeConfig(event).public.siteUrl.replace(/\/+$/, '')

  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    // Longest-match wins for Google, so these override the blanket Allow above.
    ...DISALLOW.map(path => `Disallow: ${path}`),
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')

  return body
})
