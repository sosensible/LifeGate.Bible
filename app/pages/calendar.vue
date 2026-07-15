<template>
  <div>
    <div class="bg-[#294231] py-10 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-[#C4993C] text-xs font-bold tracking-widest uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">Church Calendar</h1>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6">
      <div class="bg-white rounded shadow p-8 text-center min-h-96 flex items-center justify-center">
        <div>
          <p class="text-2xl font-serif text-[#2A1A0E] mb-2">Google Calendar</p>
          <p class="text-[#8C7050]">Your embedded calendar will appear here</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
