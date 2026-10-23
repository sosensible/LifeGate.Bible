// The church's name, address, logo and the rest, from /api/site. Fetched once
// during server rendering and handed to the browser, so the first paint is
// already right. If the request fails the neutral defaults stand in, so a page
// never breaks over it.
import { SITE_DEFAULTS, addressLines, cityLine, placeName } from '#shared/site'
import type { SiteView } from '#shared/site'
import { iconSrc, logoSrc } from '#shared/site-logo'

export const useSite = () => {
  const { data } = useAsyncData<SiteView>('site', () => $fetch<SiteView>('/api/site'), { default: () => SITE_DEFAULTS })
  const site = computed<SiteView>(() => data.value ?? SITE_DEFAULTS)

  return {
    site,
    cityLine: computed(() => cityLine(site.value)),
    addressLines: computed(() => addressLines(site.value)),
    placeName: computed(() => placeName(site.value)),
    // The page logo at a width, and the square icon at a size.
    logoSrc: (width: number) => logoSrc(width, site.value.logoVersion),
    iconSrc: (size: Parameters<typeof iconSrc>[0]) => iconSrc(size, site.value.logoVersion),
    // A map search for the street address, or null if there is no street yet.
    directionsUrl: computed(() => {
      if (!site.value.street) return null
      const query = [site.value.name, ...addressLines(site.value)].join(', ')
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    }),
  }
}
