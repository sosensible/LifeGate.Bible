import { allMinistries } from '~/data/directory'

// Public XML sitemap.
//
// Prerendered at build time (nuxt.config.ts -> nitro.prerender.routes), so
// NUXT_PUBLIC_SITE_URL is a BUILD-time variable here, not a runtime one:
//   NUXT_PUBLIC_SITE_URL=https://lifegate.bible npm run build
// Setting it only in the container environment will not change the baked file.
//
// Member-gated routes are deliberately absent -- /members, /directory, /calendar
// and /admin/directory all carry `middleware: 'auth'` -- as is /login, which has
// no search value. Listing gated URLs in a sitemap just invites crawlers to
// bounce off the auth redirect.
//
// No <lastmod>, <changefreq> or <priority>. The content has no genuine
// modification dates to report, and Google ignores the latter two outright;
// emitting invented values is worse than omitting them.

const STATIC_PATHS = [
  '/',
  '/about',
  '/ministries',
  '/teaching',
  '/seeking-pastor',
  '/pastoral-candidates',
  '/giving',
  '/contact',
]

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

export default defineEventHandler((event) => {
  // Trailing slashes stripped so we never emit a '//about' style loc.
  const siteUrl = useRuntimeConfig(event).public.siteUrl.replace(/\/+$/, '')

  // Ministry detail pages are public (name + description show to everyone; only
  // the roster is gated inside the page), so they belong here.
  const paths = [
    ...STATIC_PATHS,
    ...allMinistries().map(m => `/ministries/${m.slug}`),
  ]

  const urls = paths
    .map(path => `  <url><loc>${escapeXml(siteUrl + path)}</loc></url>`)
    .join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
})
