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

useHead({
  htmlAttrs: {
    lang: 'en',
  },
  // Belt-and-braces alongside the X-Robots-Tag header set in
  // server/middleware/noindex.ts. Only emitted while this deployment is not
  // meant to be indexed (the default), so the preview host at
  // new.lifegate.bible cannot compete with the canonical site in search.
  meta: indexable
    ? []
    : [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<style scoped>
:deep(body) {
  font-family: 'Lato', sans-serif;
  margin: 0;
}
</style>
