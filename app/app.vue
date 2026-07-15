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
