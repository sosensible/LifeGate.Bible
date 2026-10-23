// The web app manifest: what a phone calls the site when it is put on a home
// screen, and which icons it uses. Built from the church's settings, so a change
// there is a change here. (It used to be a fixed file written at build time.)
import { ICON_SIZES, iconSrc } from '../../shared/site-logo.ts'
import type { SiteView } from '../../shared/site.ts'

export const buildManifest = (site: SiteView) => ({
  id: '/',
  name: site.name,
  short_name: site.shortName,
  description: site.description || site.name,
  // Installed, it opens at the members area; signed out that lands on login,
  // which is where someone who installed the app wants to be.
  start_url: '/members',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  theme_color: '#164826',
  background_color: '#ffffff',
  icons: [
    { src: iconSrc(192, site.logoVersion), sizes: '192x192', type: 'image/png' },
    { src: iconSrc(512, site.logoVersion), sizes: '512x512', type: 'image/png' },
    { src: iconSrc(512, site.logoVersion), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
})

// Every size the manifest and the page head may ask for.
export const ICON_SIZE_LIST = ICON_SIZES
