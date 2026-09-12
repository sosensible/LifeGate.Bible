<template>
  <div>
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">Members Directory</h1>
      </div>
    </div>

    <!-- Search -->
    <div class="bg-muted border-b border-default py-5 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="relative max-w-md">
          <UIcon name="i-lucide-search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-600 pointer-events-none" />
          <input
            v-model="search"
            type="text"
            placeholder="Search by name or ministry..."
            class="w-full pl-11 pr-4 py-3 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>
    </div>

    <!-- Cards -->
    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <div v-if="filtered.length === 0" class="text-center py-16">
          <p class="font-serif text-xl text-muted mb-2">No members found</p>
          <p class="text-muted text-sm">Try a different name or ministry</p>
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="m in filtered" :key="m.id" class="bg-elevated rounded-lg overflow-hidden shadow-sm border border-default">
            <div class="h-1.5" :style="{ backgroundColor: m.color }"></div>
            <div class="p-5">
              <div class="flex gap-3.5 items-center mb-4">
                <div class="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white font-bold" :style="{ backgroundColor: m.color }">{{ m.initials }}</div>
                <div class="min-w-0">
                  <h3 class="font-serif font-bold text-highlighted leading-tight">{{ m.name }}</h3>
                  <p class="text-muted text-[11px] uppercase tracking-wide">{{ m.role }}</p>
                </div>
              </div>
              <p class="text-gold-600 text-[9px] tracking-[0.15em] uppercase mb-0.5">Family Unit</p>
              <p class="text-toned text-xs mb-2.5">{{ m.family || 'Individual Member' }}</p>
              <p class="text-gold-600 text-[9px] tracking-[0.15em] uppercase mb-0.5">Ministries</p>
              <p class="text-toned text-xs mb-3.5">
                <template v-for="(min, i) in m.ministries" :key="min">
                  <NuxtLink :to="`/ministries/${ministrySlug(min)}`" class="text-primary hover:underline">{{ min }}</NuxtLink><span v-if="i < m.ministries.length - 1"> · </span>
                </template>
              </p>
              <div class="border-t border-default pt-3.5 flex flex-col gap-2 text-xs text-toned">
                <div class="flex gap-2.5 items-center"><UIcon name="i-lucide-phone" class="w-3.5 h-3.5 text-gold-600 shrink-0" /><span>{{ m.phone }}</span></div>
                <div class="flex gap-2.5 items-center"><UIcon name="i-lucide-mail" class="w-3.5 h-3.5 text-gold-600 shrink-0" /><span>{{ m.email }}</span></div>
                <div class="flex gap-2.5 items-start"><UIcon name="i-lucide-map-pin" class="w-3.5 h-3.5 text-gold-600 shrink-0 mt-0.5" /><span>{{ m.address }}</span></div>
                <div class="flex gap-2.5 items-center"><UIcon name="i-lucide-calendar" class="w-3.5 h-3.5 text-gold-600 shrink-0" /><span>Birthday: {{ m.birthday }}</span></div>
              </div>
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

import { members, ministrySlug } from '~/data/directory'

const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return members
  return members.filter(m =>
    m.name.toLowerCase().includes(q)
    || m.ministries.some(min => min.toLowerCase().includes(q)),
  )
})
</script>
