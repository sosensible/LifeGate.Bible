<template>
  <div class="bg-elevated rounded-lg overflow-hidden shadow-sm border border-default">
    <div class="h-1.5" :style="{ backgroundColor: color }" />
    <div class="p-5">
      <div class="flex gap-3.5 items-center mb-4">
        <img v-if="entry.photoUrl" :src="entry.photoUrl" :alt="fullName(entry)" class="w-12 h-12 rounded-full object-cover shrink-0">
        <div v-else class="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white font-bold" :style="{ backgroundColor: color }">
          {{ initialsOf(entry) }}
        </div>
        <div class="min-w-0">
          <h3 class="font-serif font-bold text-highlighted leading-tight">{{ fullName(entry) }}</h3>
          <p v-if="entry.title" class="text-muted text-[11px] uppercase tracking-wide">{{ entry.title }}</p>
        </div>
        <UBadge v-if="badge" color="neutral" variant="subtle" size="sm" class="ml-auto shrink-0 self-start">{{ badge }}</UBadge>
      </div>

      <template v-if="entry.householdName">
        <p class="text-gold-600 text-[9px] tracking-[0.15em] uppercase mb-0.5">Household</p>
        <p class="text-toned text-xs mb-2.5">{{ entry.householdName }}</p>
      </template>

      <template v-if="entry.ministries?.length">
        <p class="text-gold-600 text-[9px] tracking-[0.15em] uppercase mb-0.5">Ministries</p>
        <p class="text-toned text-xs mb-3.5">
          <template v-for="(ministry, i) in entry.ministries" :key="ministry.slug">
            <NuxtLink v-if="linkMinistries" :to="`/ministries/${ministry.slug}`" class="text-primary hover:underline">{{ ministry.name }}</NuxtLink>
            <span v-else>{{ ministry.name }}</span>
            <span v-if="i < entry.ministries.length - 1"> · </span>
          </template>
        </p>
      </template>

      <div v-if="hasDetails" class="border-t border-default pt-3.5 flex flex-col gap-2 text-xs text-toned">
        <div v-if="entry.phone" class="flex gap-2.5 items-center">
          <UIcon name="i-lucide-phone" class="w-3.5 h-3.5 text-gold-600 shrink-0" />
          <a :href="`tel:${entry.phone}`" class="hover:underline">{{ entry.phone }}</a>
        </div>
        <div v-if="entry.email" class="flex gap-2.5 items-center">
          <UIcon name="i-lucide-mail" class="w-3.5 h-3.5 text-gold-600 shrink-0" />
          <a :href="`mailto:${entry.email}`" class="hover:underline break-all">{{ entry.email }}</a>
        </div>
        <div v-if="entry.address" class="flex gap-2.5 items-start">
          <UIcon name="i-lucide-map-pin" class="w-3.5 h-3.5 text-gold-600 shrink-0 mt-0.5" />
          <span>{{ entry.address }}</span>
        </div>
        <div v-if="entry.birthday" class="flex gap-2.5 items-center">
          <UIcon name="i-lucide-cake" class="w-3.5 h-3.5 text-gold-600 shrink-0" />
          <span>Birthday: {{ formatBirthday(entry.birthday) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DirectoryEntry } from '#shared/privacy'

const props = withDefaults(defineProps<{
  entry: DirectoryEntry
  linkMinistries?: boolean
  badge?: string
}>(), { linkMinistries: true })

const color = computed(() => avatarColor(props.entry.id))
const hasDetails = computed(() => Boolean(props.entry.phone || props.entry.email || props.entry.address || props.entry.birthday))
</script>
