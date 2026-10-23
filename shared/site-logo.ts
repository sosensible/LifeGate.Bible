// The logo as a set of files. The browser makes them from the one picture that is
// uploaded; the server checks each is a PNG of the size it claims (see
// server/lib/site-logo.ts) and stores them under a version number.

// The page's logo, in proportion, at these widths.
export const LOGO_WIDTHS = [216, 432, 864] as const
// Square icons: browser tab (16, 32, 48), iPhone home screen (180, opaque),
// Android home screen (192, 512).
export const ICON_SIZES = [16, 32, 48, 180, 192, 512] as const

export const logoPartName = (width: number) => `logo-${width}`
export const iconPartName = (size: number) => `icon-${size}`
export const LOGO_PART_NAMES = [...LOGO_WIDTHS.map(logoPartName), ...ICON_SIZES.map(iconPartName)]

// The built-in placeholder, used until a church uploads its own and whenever the
// uploaded files are missing. Addresses of the files in public/.
export const BUILT_IN_ICONS = {
  16: '/favicon-16x16.png',
  32: '/favicon-32x32.png',
  48: '/favicon-48x48.png',
  180: '/apple-touch-icon.png',
  192: '/icon-192.png',
  512: '/icon-512.png',
} as const

export const builtInLogo = (width: number) => `/images/logo-${width}.png`
export const uploadedLogo = (width: number, version: number) => `/site/logo/${width}.png?v=${version}`
export const uploadedIcon = (size: number, version: number) => `/site/icon/${size}.png?v=${version}`

// Where a page finds each file, for the church's current logo.
export const logoSrc = (width: number, version: number) => version > 0 ? uploadedLogo(width, version) : builtInLogo(width)
export const iconSrc = (size: keyof typeof BUILT_IN_ICONS, version: number) => version > 0 ? uploadedIcon(size, version) : BUILT_IN_ICONS[size]
