<template>
  <!-- The install dialog. Nothing shows until a button opens it (manual-*); the
       name and icon come from the church's manifest, so it follows Church details. -->
  <pwa-install
    ref="dialog"
    manual-apple
    manual-chrome
    manifest-url="/manifest.webmanifest"
  />
</template>

<script setup lang="ts">
const dialog = ref<PwaInstallElement>()

// Loaded in the browser only: it uses the page's own APIs, and most pages never
// open it.
onMounted(async () => {
  await import('@khmyznikov/pwa-install')
  await customElements.whenDefined('pwa-install')
  if (dialog.value) installGuide.register(dialog.value)
})
onBeforeUnmount(() => installGuide.unregister())
</script>
