export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devServer: {
    // Port fixed at 3007. Network exposure is handled by the `--host` flag in the
    // `dev` script (listhen dual-stack: LAN + localhost/IPv6 both work).
    port: 3007,
  },
  nitro: {
    // Deploy target. Default is the self-hosted Node server (`.output/server/index.mjs`),
    // which is what the Docker image in ./Dockerfile runs on the ZimaOS box behind the
    // Cloudflare Tunnel. Left env-overridable so a Cloudflare build still works:
    //   NITRO_PRESET=cloudflare_pages npm run build
    // Pinned rather than auto-detected so the artifact never depends on which machine
    // or CI provider happens to run the build.
    preset: process.env.NITRO_PRESET || 'node-server',
    prerender: {
      crawlLinks: false,
      // Served by server/routes/sitemap.xml.ts and server/routes/robots.txt.ts.
      // Because they are prerendered, the absolute URLs inside are fixed at BUILD
      // time from runtimeConfig.public.siteUrl (see below) -- changing the host
      // means rebuilding, not just restarting.
      routes: ['/sitemap.xml', '/robots.txt'],
    },
    cloudflare: {
      pages: {
        routes: {
          include: ['/*'],
          exclude: ['/api/**'],
        },
      },
      bindings: {
        db: 'lifegate_db',
        EMAIL: { type: 'email' },
      },
    },
  },
  runtimeConfig: {
    public: {
      // Canonical public origin, used for the absolute <loc> URLs in /sitemap.xml.
      // The sitemap is prerendered, so override this at BUILD time:
      //   NUXT_PUBLIC_SITE_URL=https://lifegate.bible npm run build
      // Keep it the canonical hostname even when the box is reached through a
      // Cloudflare Tunnel -- a sitemap full of *.trycloudflare.com URLs is worse
      // than no sitemap.
      siteUrl: 'https://lifegate.bible',
    },
  },
  modules: [
    '@nuxt/ui',
    '@nuxtjs/google-fonts',
    '@pinia/nuxt',
  ],
  // @nuxt/ui v4 requires this CSS entry; color aliases live in app.config.ts.
  css: ['~/assets/css/main.css'],
  // No dark mode. Disable the color-mode integration entirely so the `.dark`
  // class is never added to <html>. Nuxt UI's dark styling is purely class-based
  // (no prefers-color-scheme media query), so with the class never present the
  // site is light-only and never follows the OS.
  ui: {
    colorMode: false,
  },
  googleFonts: {
    families: {
      'Playfair Display': [400, 600, 700],
      'Lato': [300, 400, 600, 700],
    },
  },
  app: {
    head: {
      title: 'Lifegate Baptist Church',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Lifegate Baptist Church - Eau Claire, Michigan' },
      ],
      link: [
        // Favicon generated from the church crest logo (public/logo.png).
        // ?v= busts the browser's aggressive favicon cache; bump it if the icon changes.
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png?v=2' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png?v=2' },
        { rel: 'icon', type: 'image/png', href: '/favicon-32x32.png?v=2' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png?v=2' },
      ],
    },
  },
})
