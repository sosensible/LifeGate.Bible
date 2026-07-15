<template>
  <div>
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">Sermons</h1>
      </div>
    </div>

    <!-- Live stream -->
    <div class="bg-parchment-900 py-11 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="flex items-center gap-3 mb-4">
          <span class="bg-secondary text-white px-2.5 py-1 text-xs font-bold tracking-wider uppercase rounded-sm">● Live</span>
          <p class="text-gold-400 text-xs tracking-[0.15em] uppercase">Sunday Morning Worship Service</p>
        </div>
        <div class="bg-black rounded-lg aspect-video max-w-3xl flex flex-col items-center justify-center gap-3 border border-white/10">
          <div class="w-16 h-16 rounded-full bg-gold-500/10 border-2 border-gold-500/40 flex items-center justify-center">
            <UIcon name="i-lucide-play" class="w-7 h-7 text-gold-400" />
          </div>
          <div class="text-center px-4">
            <p class="text-white/50 text-sm">Live stream embed goes here</p>
            <p class="text-white/30 text-xs">YouTube, Vimeo, Facebook Live, or other provider</p>
          </div>
        </div>
        <div class="flex gap-3 mt-5 flex-wrap">
          <UButton size="md" class="bg-gold-500 text-highlighted hover:bg-gold-600 uppercase tracking-wide font-bold">Watch Live</UButton>
          <UButton size="md" variant="outline" class="text-gold-400 ring-gold-500/40 hover:bg-gold-500/10 uppercase tracking-wide font-semibold">Download Sermon Notes (PDF)</UButton>
        </div>
      </div>
    </div>

    <!-- Archive -->
    <div class="bg-default py-14 px-6">
      <div class="max-w-6xl mx-auto">
        <h2 class="text-3xl font-bold font-serif text-highlighted mb-8">Recent Sermons</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="s in sermons" :key="s.id" class="bg-elevated rounded-lg overflow-hidden shadow-sm border border-default">
            <div class="h-32 flex items-center justify-center relative" :style="{ backgroundColor: s.color }">
              <UIcon name="i-lucide-play" class="w-9 h-9 text-white/30" />
              <div class="absolute bottom-2.5 right-2.5 flex gap-1.5">
                <span v-for="f in s.formats" :key="f" class="bg-black/55 text-white px-2 py-0.5 text-[10px] font-semibold rounded-sm">{{ f }}</span>
              </div>
            </div>
            <div class="p-5">
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase mb-1.5">{{ s.series }}</p>
              <h3 class="font-serif text-lg font-bold text-highlighted leading-tight mb-2">{{ s.title }}</h3>
              <p class="text-muted text-xs mb-3.5">{{ s.date }} · {{ s.pastor }}</p>
              <span class="text-primary text-xs font-bold border-b-2 border-gold-500 pb-0.5 cursor-pointer">Watch / Download →</span>
            </div>
          </div>
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

// Demo data until live sermons are wired in.
const sermons = [
  { id: 1, title: 'The Good Shepherd', series: 'Gospel of John', date: 'June 22, 2025', pastor: 'Pastor Dave', formats: ['Video', 'PDF'], color: '#1A5C30' },
  { id: 2, title: 'Walking in the Light', series: 'Gospel of John', date: 'June 15, 2025', pastor: 'Pastor Dave', formats: ['Video', 'PDF'], color: '#7B1828' },
  { id: 3, title: 'Bread of Life', series: 'Gospel of John', date: 'June 8, 2025', pastor: 'Pastor Dave', formats: ['Video', 'Audio', 'PDF'], color: '#256035' },
  { id: 4, title: 'Grace Abounding', series: 'Romans: The Gospel Unveiled', date: 'June 1, 2025', pastor: 'Pastor Dave', formats: ['Video', 'PDF'], color: '#5D1220' },
  { id: 5, title: 'Justification by Faith', series: 'Romans: The Gospel Unveiled', date: 'May 25, 2025', pastor: 'Pastor Dave', formats: ['Video'], color: '#4A3C1A' },
  { id: 6, title: 'The Love Chapter', series: 'Special Series', date: 'May 18, 2025', pastor: 'Guest Speaker', formats: ['Video', 'Audio'], color: '#2A3C6C' },
]
</script>
