// The web app manifest, built from the church's settings. See server/lib/site-manifest.ts.
import { buildManifest } from '../lib/site-manifest.ts'
import { loadSite } from '../lib/site.ts'

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'application/manifest+json')
  // Short: a changed name or logo should reach a phone soon.
  setHeader(event, 'cache-control', 'public, max-age=300')
  return buildManifest(loadSite())
})
