<template>
  <div>
    <div class="bg-[#ebe6d2] py-24 px-6">
      <div class="max-w-4xl mx-auto text-center">
        <p class="text-[#1A5C30] text-sm font-bold tracking-widest uppercase mb-4">Eau Claire, Michigan</p>
        <h1 class="text-6xl font-bold font-serif text-[#2A1A0E] mb-4 leading-tight">
          Where Life<br><span class="text-[#7B1828]">Meets the Word.</span>
        </h1>
        <p class="text-lg text-[#5C4230] mb-8 max-w-md mx-auto leading-relaxed">A Baptist church family in Eau Claire, Michigan — gathering in faith, friendship, and the love of Scripture.</p>
        <div class="flex gap-4 justify-center flex-wrap">
          <UButton color="primary" variant="solid" size="lg">Plan Your Visit</UButton>
          <UButton @click="navigateTo('/login')" color="error" variant="outline" size="lg">Member Login</UButton>
        </div>
      </div>
    </div>

    <div class="bg-[#4f272e] py-8 px-6">
      <div class="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
        <div>
          <p class="text-[#C4993C] text-xs font-bold tracking-widest uppercase mb-2">Sunday School</p>
          <p class="text-2xl font-bold font-serif text-white mb-1">10:00 AM</p>
          <p class="text-[#DBC0BC] text-sm">All Ages</p>
        </div>
        <div class="border-l border-r border-gray-600">
          <p class="text-[#C4993C] text-xs font-bold tracking-widest uppercase mb-2">Sunday Worship</p>
          <p class="text-2xl font-bold font-serif text-white mb-1">11:00 AM</p>
          <p class="text-[#DBC0BC] text-sm">Main Service</p>
        </div>
        <div>
          <p class="text-[#C4993C] text-xs font-bold tracking-widest uppercase mb-2">Wednesday Evening</p>
          <p class="text-2xl font-bold font-serif text-white mb-1">6:30 PM</p>
          <p class="text-[#DBC0BC] text-sm">Prayer & Study</p>
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
