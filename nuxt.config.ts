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
    plugins: [
      {
        // Dev server only (configureServer never runs in a build).
        //
        // Vite serves the same URL, e.g. /_nuxt/assets/css/main.css, as CSS for a
        // <link> and as JavaScript for an import, with `Cache-Control: no-cache`.
        // Through the Cloudflare Tunnel that header is rewritten to
        // `max-age=14400` (the zone's Browser Cache TTL), so the browser reuses
        // the CSS copy for the import, rejects it ("MIME type text/css"), and the
        // app never starts. Cloudflare leaves `no-store` alone, so force it.
        name: 'lifegate:dev-no-store-through-tunnel',
        configureServer(server) {
          server.middlewares.use((_req, res, next) => {
            const setHeader = res.setHeader.bind(res)
            res.setHeader = (name, value) =>
              setHeader(name, name.toLowerCase() === 'cache-control' ? 'no-store' : value)
            setHeader('Cache-Control', 'no-store')
            next()
          })
        },
      },
    ],
    optimizeDeps: {
      // Pre-bundle client dependencies Vite would otherwise discover on first
      // use. Discovery triggers a full page reload in dev, which silently wiped
      // a half-filled sign-in form. List taken from Vite's own dev-server hint.
      include: [
        'better-auth/vue',
        'better-auth/client/plugins',
        'better-auth/plugins/access',
        'better-auth/plugins/admin/access',
        'zod',
      ],
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
    // Stewardship's bank sync (server/tasks/stewardship/sync.ts) runs four times
    // a day, well under SimpleFIN's ~24 requests a day. It does nothing until
    // SIMPLEFIN_ACCESS_URL is set. Recurring transactions set to be entered
    // automatically are entered each morning (server/tasks/stewardship/recurring.ts).
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      '0 5,11,17,23 * * *': ['stewardship:sync'],
      '0 6 * * *': ['stewardship:recurring'],
    },
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
  routeRules: {
    // The church office's teaching page used to be /admin/sermons.
    '/admin/sermons': { redirect: { to: '/admin/teaching', statusCode: 301 } },
    // The offline page is the only route rendered ahead of time: the service
    // worker can only fall back to a file that exists in the build.
    '/offline': { prerender: true },
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
    // YouTube player facade: nothing loads from YouTube until someone presses
    // play, and it uses the privacy-enhanced youtube-nocookie.com host.
    '@nuxt/scripts',
    '@vite-pwa/nuxt',
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
        { name: 'theme-color', content: '#164826' },
        // Installed on a home screen, these make it open as an app rather than
        // in a browser tab. iPhone reads the apple- ones and ignores the
        // manifest's `display`.
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Lifegate' },
      ],
      link: [
        // Icons made from the church crest (public/logo.png): favicons for browser tabs,
        // an opaque apple-touch-icon for iPhone home screens (iOS shows transparency as
        // black). The 192/512 icons for Android are listed in the PWA manifest below.
        // ?v= busts the browser's aggressive icon cache; bump it if the icons change.
        { rel: 'icon', type: 'image/png', sizes: '48x48', href: '/favicon-48x48.png?v=3' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png?v=3' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png?v=3' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png?v=3' },
        // @vite-pwa/nuxt writes /manifest.webmanifest but does not add this
        // link on Nuxt 4 (its Nuxt integration still asks for kit 3). Without
        // the link a browser will not offer to install the site, so it is
        // written here rather than left to the module.
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },

  // Installable on a phone, and the member pages readable without a signal.
  // What is kept offline is member information, so `app/stores/auth.ts` empties
  // these caches the moment someone signs out or a different person signs in.
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      id: '/',
      name: 'Lifegate Baptist Church',
      short_name: 'Lifegate',
      description: 'Lifegate Baptist Church — Eau Claire, Michigan',
      // Installed, it opens at the members area; signed out that lands on login,
      // which is where someone who installed the app wants to be.
      start_url: '/members',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#164826',
      background_color: '#ffffff',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    // The worker is written by hand (service-worker/sw.ts) rather than
    // generated. Workbox's generated `navigateFallback` answers every matching
    // navigation with the offline page whether or not the network is up, which
    // on a server-rendered site means the whole site reads "No connection".
    // Only the precache list is generated here; the routing lives in the file.
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    injectManifest: {
      // The app's own code and fonts. No page and no API answer is precached.
      // The offline page carries the site header, so the crest has to be here
      // too or it shows a broken image exactly when nothing can be fetched.
      // The header asks for 72px, which picks the 216 and 432 widths; the 864
      // pair is never requested at that size and is left out.
      globPatterns: [
        '**/*.{js,css,woff2}',
        'offline/index.html',
        'icon-*.png',
        'favicon*.png',
        // Every AVIF width: the header asks for 72px, but a browser is allowed
        // to reuse a wider copy it already holds (the home page's hero asks for
        // 864), and offline it must find whichever one it settles on.
        'images/logo-*.avif',
        // PNG only up to 432 — that is the `src` fallback and the widest a
        // 72px slot can ask for. The 864 PNG is 367 kB and stays out.
        'images/logo-{216,432}.png',
      ],
    },
    client: {
      // The browser offers installation itself; there is no prompt of our own.
      installPrompt: false,
      // How often an open app re-checks for a new worker, in seconds.
      //
      // This is the recovery path for a bad release. Chrome throttles the
      // update check it does on its own: with a broken worker installed,
      // repeated navigations did not pick up a corrected one, because plain
      // `register()` is subject to that throttle. This check is not -- it
      // re-fetches the worker with `cache: no-store` before calling `update()`
      // -- so it is what actually gets a stuck phone back onto a working site.
      //
      // The first check happens one interval after the app opens, never on
      // load, so the number is the worst-case time somebody stays stuck. Ten
      // minutes costs an open tab roughly 230 kB an hour; lower it if a release
      // ever goes wrong, raise it if that traffic is unwelcome.
      periodicSyncForUpdates: 600,
    },
    devOptions: { enabled: false },
  },
})
