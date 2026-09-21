<template>
  <!-- Shown when the installed app is opened without a signal and the page
       asked for was never stored. Rendered ahead of time (see routeRules), so
       it is a file the service worker can always fall back to. -->
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Lifegate Baptist Church</p>
        <h1 class="text-4xl font-bold font-serif text-white">No connection</h1>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6">
      <div class="bg-elevated border border-default rounded-lg p-8">
        <p class="text-toned">
          This page has not been opened on this phone before, so there is no copy to read
          without a signal.
        </p>
        <p class="text-muted text-sm mt-3">
          The members area, ministries and the calendar can be read offline once you have
          visited them while connected. Everything else needs a connection.
        </p>

        <div class="flex flex-wrap gap-3 mt-6">
          <UButton icon="i-lucide-refresh-cw" @click="retry">Try again</UButton>
          <UButton to="/members" variant="outline" icon="i-lucide-users">Members area</UButton>
          <UButton to="/calendar" variant="outline" icon="i-lucide-calendar-days">Calendar</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' })

useHead({
  title: 'No connection',
  meta: [{ name: 'robots', content: 'noindex' }],
})

const retry = () => reloadNuxtApp({ persistState: false })
</script>
