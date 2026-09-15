import { and, asc, desc, eq } from 'drizzle-orm'
import { ministries, sermons } from '../database/schema/index.ts'
import { db } from '../lib/db.ts'

// Public XML sitemap.
//
// Served live (not prerendered), so NUXT_PUBLIC_SITE_URL is a plain runtime env
// var: change it in the compose file and restart, no rebuild needed.
//
// While NUXT_PUBLIC_INDEXABLE is false this is still served -- useful for
// checking the output -- but robots.txt does not advertise it and every response
// carries X-Robots-Tag: noindex.
//
// Member-gated routes are deliberately absent -- /members, /directory, /calendar,
// /profile and /admin/* all carry `middleware: 'auth'` -- as is /login, which has
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
  '/privacy',
  '/terms',
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
    ...db.select({ slug: ministries.slug }).from(ministries).orderBy(asc(ministries.name)).all()
      .map(m => `/ministries/${m.slug}`),
    // Only published public sermons. Members-only ones would bounce to sign-in.
    ...db.select({ slug: sermons.slug }).from(sermons)
      .where(and(eq(sermons.status, 'published'), eq(sermons.visibility, 'public')))
      .orderBy(desc(sermons.preachedOn)).all()
      .map(s => `/teaching/${s.slug}`),
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
