<template>
  <NuxtLink :to="`/missions/${missionary.slug}`" class="bg-elevated rounded-lg overflow-hidden shadow-sm border border-default block hover:border-primary transition-colors group">
    <img v-if="missionary.photoUrl" :src="missionary.photoUrl" :alt="missionary.name" class="w-full aspect-[4/3] object-cover">
    <div v-else class="w-full aspect-[4/3] flex items-center justify-center text-white" :style="{ backgroundColor: avatarColor(missionary.id) }">
      <UIcon :name="missionary.kind === 'family' ? 'i-lucide-users' : 'i-lucide-user-round'" class="w-12 h-12 opacity-80" />
    </div>
    <div class="p-5">
      <div class="flex items-start justify-between gap-2 mb-1">
        <h3 class="font-serif text-lg font-bold text-highlighted leading-tight group-hover:text-primary transition-colors">{{ missionary.name }}</h3>
        <UBadge v-if="missionary.status !== 'onField'" color="neutral" variant="subtle" size="sm" class="shrink-0">{{ MISSIONARY_STATUS_LABELS[missionary.status] }}</UBadge>
      </div>
      <p v-if="missionary.familyNames" class="text-muted text-xs mb-2">{{ missionary.familyNames }}</p>
      <p v-if="place" class="text-toned text-sm">{{ place }}</p>
      <p v-if="missionary.organization" class="text-gold-600 text-[11px] uppercase tracking-wide mt-2">{{ missionary.organization.name }}</p>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
import { MISSIONARY_STATUS_LABELS, type MissionaryView } from '#shared/missions'

const props = defineProps<{ missionary: MissionaryView }>()

// "Church planting · Peru"
const place = computed(() => [props.missionary.focus, props.missionary.field].filter(Boolean).join(' · '))
</script>
