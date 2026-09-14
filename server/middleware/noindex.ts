// Sends `X-Robots-Tag: noindex, nofollow` on every response unless this
// deployment has explicitly opted in via NUXT_PUBLIC_INDEXABLE=true.
//
// Why a header and not just `Disallow: /` in robots.txt:
// robots.txt controls CRAWLING, not INDEXING. A URL blocked there can still be
// indexed (URL only, no content) if anything links to it -- and because the
// crawler is forbidden from fetching the page, it never sees a `noindex` meta
// tag either. Blocking crawl while hoping for de-indexing is the classic
// staging-site mistake. A header applies to every response including
// /sitemap.xml itself, needs no HTML parsing, and is unambiguous.
//
// This is SEO hygiene, not access control. To actually restrict who can reach
// the preview, put Cloudflare Access in front of the tunnel hostname.
export default defineEventHandler((event) => {
  if (useRuntimeConfig(event).public.indexable) return

  setHeader(event, 'x-robots-tag', 'noindex, nofollow')
})
