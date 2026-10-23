<template>
  <UApp>
    <div class="min-h-screen bg-default text-default">
      <NuxtRouteAnnouncer />
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>
  </UApp>
</template>

<script setup lang="ts">
const { indexable } = useRuntimeConfig().public
const { site, iconSrc } = useSite()

useHead({
  // Pages give only their own title ("About"); the church's name follows.
  titleTemplate: title => title ? `${title} | ${site.value.name}` : site.value.name,
  htmlAttrs: {
    lang: 'en',
  },
  link: () => [
    // Browser tab, iPhone home screen, and the phone app's manifest. All follow the
    // church's logo; the version in the address makes a browser fetch a new one.
    { rel: 'icon', type: 'image/png', sizes: '48x48', href: iconSrc(48) },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: iconSrc(32) },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: iconSrc(16) },
    { rel: 'apple-touch-icon', sizes: '180x180', href: iconSrc(180) },
    // @vite-pwa/nuxt does not add this link on Nuxt 4, and without it a browser
    // will not offer to install the site.
    { rel: 'manifest', href: '/manifest.webmanifest' },
  ],
  // Belt-and-braces alongside the X-Robots-Tag header set in
  // server/middleware/noindex.ts. Only emitted while this deployment is not
  // meant to be indexed (the default), so the preview host at
  // new.lifegate.bible cannot compete with the canonical site in search.
  meta: [
    { name: 'description', content: () => site.value.description || site.value.name },
    { name: 'apple-mobile-web-app-title', content: () => site.value.shortName },
    ...(indexable ? [] : [{ name: 'robots', content: 'noindex, nofollow' }]),
  ],
})
</script>

<style scoped>
:deep(body) {
  font-family: 'Lato', sans-serif;
  margin: 0;
}
</style>
