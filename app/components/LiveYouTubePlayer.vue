<template>
  <div class="relative aspect-video rounded-lg overflow-hidden bg-black">
    <iframe
      v-if="playing"
      :src="src"
      :title="title"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen
      class="absolute inset-0 w-full h-full"
    />
    <!-- Nothing is requested from YouTube until the viewer presses play. -->
    <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <UButton size="xl" icon="i-lucide-play" class="uppercase tracking-wide font-bold" @click="playing = true">Join Live Meeting</UButton>
      <p class="text-white/60 text-xs">Plays from YouTube</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { YouTubeLive } from '#shared/live'

const props = defineProps<{ youtube: YouTubeLive, title: string }>()
const playing = ref(false)

// Privacy-enhanced mode. A channel plays whatever is live on it.
const src = computed(() => 'videoId' in props.youtube
  ? `https://www.youtube-nocookie.com/embed/${props.youtube.videoId}?autoplay=1&rel=0&playsinline=1`
  : `https://www.youtube-nocookie.com/embed/live_stream?channel=${props.youtube.channelId}&autoplay=1&playsinline=1`)
</script>
