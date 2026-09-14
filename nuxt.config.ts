export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devServer: {
    // Port fixed at 3007. Network exposure is handled by the `--host` flag in the
    // `dev` script (listhen dual-stack: LAN + localhost/IPv6 both work).
    port: 3007,
  },
  vite: {
    server: {
      // Vite 7 rejects requests whose Host header it does not recognise (a
      // DNS-rebinding guard), which is what a Cloudflare Tunnel pointed at the
      // dev server hits:
      //   Blocked request. This host ("new.lifegate.bible") is not allowed.
      // The leading dot allows lifegate.bible and every subdomain, so www/new/
      // preview hosts all work without further edits. Dev-server only -- the
      // production Nitro server does no host checking.
      allowedHosts: ['.lifegate.bible'],
    },
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
      // Nothing is prerendered. /sitemap.xml and /robots.txt are served live by
      // server/routes/ so their hostname and indexability come from runtime env
      // (see runtimeConfig below). Prerendering them would freeze both into the
      // image, meaning the preview -> canonical switch needed a rebuild and a
      // re-push of a ~250MB image rather than an env change plus a restart.
      routes: [],
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
      // Public origin this deployment answers on, used for the absolute <loc>
      // URLs in /sitemap.xml and the Sitemap: line in /robots.txt.
      // Runtime override (no rebuild): NUXT_PUBLIC_SITE_URL=https://new.lifegate.bible
      siteUrl: 'https://new.lifegate.bible',

      // Whether search engines may index this deployment. Defaults to FALSE so a
      // preview host can never be indexed by accident -- only a deliberate
      // NUXT_PUBLIC_INDEXABLE=true opts in.
      //
      // While false, every response carries `X-Robots-Tag: noindex, nofollow`
      // (server/middleware/noindex.ts), pages carry a matching <meta> tag, and
      // robots.txt omits the Sitemap: line.
      //
      // At launch, set NUXT_PUBLIC_INDEXABLE=true and point NUXT_PUBLIC_SITE_URL
      // at the canonical host. Both are plain container env vars: change them in
      // the compose file and restart. No rebuild, no re-push.
      indexable: false,
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
