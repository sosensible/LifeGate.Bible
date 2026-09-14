<template>
  <ScriptYouTubePlayer
    v-if="sermon.videoProvider === 'youtube' && sermon.videoId"
    :video-id="sermon.videoId"
    :player-vars="{ autoplay: 0, playsinline: 1, rel: 0 }"
    class="rounded-lg overflow-hidden"
  >
    <!-- Our own copy of the thumbnail, so nothing is requested from YouTube
         until the viewer presses play. -->
    <template #placeholder>
      <img :src="sermonThumbnailUrl(sermon.slug)" :alt="`Play ${sermon.title}`" class="absolute inset-0 w-full h-full object-cover" loading="lazy">
      <span class="absolute inset-0 flex items-center justify-center bg-black/20">
        <span class="w-16 h-16 rounded-full bg-primary-800/90 border-2 border-gold-400 flex items-center justify-center shadow-lg">
          <UIcon name="i-lucide-play" class="w-7 h-7 text-gold-300 ml-1" />
        </span>
      </span>
    </template>
    <template #error>
      <div class="absolute inset-0 flex items-center justify-center p-6 text-center text-white/80 text-sm">
        The video could not load. Check your connection and try again.
      </div>
    </template>
  </ScriptYouTubePlayer>

  <div v-else class="rounded-lg aspect-video flex flex-col items-center justify-center gap-2 border border-white/10" :style="{ backgroundColor: sermonColor(sermon.id) }">
    <UIcon name="i-lucide-video-off" class="w-8 h-8 text-white/50" />
    <p class="text-white/70 text-sm">The video for this message is not posted yet.</p>
  </div>
</template>

<script setup lang="ts">
import type { SermonView } from '#shared/sermons'

defineProps<{
  sermon: Pick<SermonView, 'id' | 'slug' | 'title' | 'videoProvider' | 'videoId'>
}>()
</script>
