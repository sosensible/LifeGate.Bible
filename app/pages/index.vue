<template>
  <div>
    <div class="bg-muted py-24 px-6">
      <div class="max-w-4xl mx-auto text-center">
        <p class="text-primary text-sm font-bold tracking-widest uppercase mb-4">Eau Claire, Michigan</p>
        <h1 class="text-6xl font-bold font-serif text-highlighted mb-4 leading-tight">
          Where Life<br><span class="text-secondary">Meets the Word.</span>
        </h1>
        <p class="text-lg text-toned mb-8 max-w-md mx-auto leading-relaxed">A Baptist church family in Eau Claire, Michigan — gathering in faith, friendship, and the love of Scripture.</p>
        <div class="flex gap-4 justify-center flex-wrap">
          <UButton color="primary" variant="solid" size="lg">Plan Your Visit</UButton>
          <UButton @click="navigateTo('/login')" color="secondary" variant="outline" size="lg">Member Login</UButton>
        </div>
      </div>
    </div>

    <div class="bg-secondary-900 py-8 px-6">
      <div class="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-widest uppercase mb-2">Sunday School</p>
          <p class="text-2xl font-bold font-serif text-white mb-1">10:00 AM</p>
          <p class="text-secondary-200 text-sm">All Ages</p>
        </div>
        <div class="border-l border-r border-white/20">
          <p class="text-gold-400 text-xs font-bold tracking-widest uppercase mb-2">Sunday Worship</p>
          <p class="text-2xl font-bold font-serif text-white mb-1">11:00 AM</p>
          <p class="text-secondary-200 text-sm">Main Service</p>
        </div>
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-widest uppercase mb-2">Wednesday Evening</p>
          <p class="text-2xl font-bold font-serif text-white mb-1">6:30 PM</p>
          <p class="text-secondary-200 text-sm">Prayer &amp; Study</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const auth = useAuthStore()

onMounted(() => {
  auth.initAuth()
  if (auth.isAuthenticated) {
    navigateTo('/sermons')
  }
})
</script>
