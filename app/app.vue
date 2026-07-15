<template>
  <div class="min-h-screen bg-[#FAF8F0]">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
useHead({
  htmlAttrs: {
    lang: 'en',
  },
})
</script>

<style scoped>
:deep(body) {
  font-family: 'Lato', sans-serif;
  margin: 0;
}
</style>
