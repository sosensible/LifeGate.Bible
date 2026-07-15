export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devServer: {
    // Port fixed at 3007. Network exposure is handled by the `--host` flag in the
    // `dev` script (listhen dual-stack: LAN + localhost/IPv6 both work).
    port: 3007,
  },
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: ['/sitemap.xml'],
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
  modules: [
    '@nuxt/ui',
    '@nuxtjs/google-fonts',
    '@pinia/nuxt',
  ],
  // @nuxt/ui v4 requires this CSS entry; color aliases live in app.config.ts.
  css: ['~/assets/css/main.css'],
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
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    },
  },
})
