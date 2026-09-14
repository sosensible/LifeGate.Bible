<template>
  <article class="bg-elevated rounded-lg overflow-hidden shadow-sm border border-default flex flex-col">
    <NuxtLink :to="`/teaching/${sermon.slug}`" class="block relative aspect-video shrink-0" :style="{ backgroundColor: sermonColor(sermon.id) }" :aria-label="`Watch ${sermon.title}`">
      <img v-if="sermon.videoId" :src="sermonThumbnailUrl(sermon.slug)" alt="" class="absolute inset-0 w-full h-full object-cover" loading="lazy">
      <span class="absolute inset-0 flex items-center justify-center">
        <UIcon :name="sermon.videoId ? 'i-lucide-circle-play' : 'i-lucide-book-open'" class="w-10 h-10 text-white/80 drop-shadow" />
      </span>
      <UBadge v-if="showVisibility && sermon.visibility === 'public'" size="sm" color="neutral" variant="solid" class="absolute top-2.5 left-2.5 bg-white/90 text-primary uppercase tracking-wide">Public</UBadge>
    </NuxtLink>

    <div class="p-5 flex flex-col flex-1">
      <p v-if="sermon.series" class="text-gold-600 text-[10px] tracking-[0.15em] uppercase mb-1.5">{{ sermon.series.name }}</p>
      <h3 class="font-serif text-lg font-bold text-highlighted leading-tight mb-1.5">
        <NuxtLink :to="`/teaching/${sermon.slug}`" class="hover:text-primary">{{ sermon.title }}</NuxtLink>
      </h3>
      <p v-if="sermon.scripture" class="text-primary text-xs font-semibold mb-1.5">{{ sermon.scripture }}</p>
      <p class="text-muted text-xs mb-3">{{ formatSermonDate(sermon.preachedOn) }} · {{ sermon.speaker }}</p>
      <div v-if="sermon.tags.length" class="flex flex-wrap gap-1.5 mb-4">
        <button
          v-for="tag in sermon.tags"
          :key="tag"
          type="button"
          class="bg-muted text-toned px-2 py-0.5 text-[10px] font-semibold rounded-full hover:bg-primary hover:text-inverted transition-colors"
          @click="emit('tag', tag)"
        >
          {{ tag }}
        </button>
      </div>
      <NuxtLink :to="`/teaching/${sermon.slug}`" class="text-primary text-xs font-bold border-b-2 border-gold-500 pb-0.5 mt-auto self-start hover:text-primary-700">
        {{ sermon.videoId ? 'Watch' : 'Read more' }} →
      </NuxtLink>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { SermonView } from '#shared/sermons'

defineProps<{
  sermon: SermonView
  // Members see which messages are also public.
  showVisibility?: boolean
}>()

const emit = defineEmits<{ tag: [tag: string] }>()
</script>
