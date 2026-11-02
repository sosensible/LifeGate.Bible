<template>
  <!-- Our own hosted copy. Its play link is asked for only when the viewer presses play, and
       the server gives one only to someone who may watch this message. -->
  <div v-if="source === 'hosted'" class="relative aspect-video rounded-lg overflow-hidden" :style="{ backgroundColor: sermonColor(sermon.id) }">
    <iframe
      v-if="playUrl"
      :src="playUrl"
      :title="sermon.title"
      class="absolute inset-0 w-full h-full border-0"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen
    />
    <button v-else type="button" class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/90 cursor-pointer" :disabled="starting" :aria-label="`Play ${sermon.title}`" @click="start">
      <span class="w-16 h-16 rounded-full bg-primary-800/90 border-2 border-gold-400 flex items-center justify-center shadow-lg">
        <UIcon :name="starting ? 'i-lucide-loader-circle' : 'i-lucide-play'" class="w-7 h-7 text-gold-300" :class="starting ? 'animate-spin' : 'ml-1'" />
      </span>
      <span v-if="failure" class="text-sm text-white/80 px-6 text-center">{{ failure }}</span>
    </button>
  </div>

  <ScriptYouTubePlayer
    v-else-if="source === 'youtube' && sermon.videoId"
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
import { playerSource } from '#shared/hosted-video'
import type { SermonView } from '#shared/sermons'

const props = defineProps<{
  sermon: Pick<SermonView, 'id' | 'slug' | 'title' | 'videoProvider' | 'videoId' | 'hosted'>
}>()

// Our copy once it is ready, otherwise the YouTube video if there is one.
const source = computed(() => playerSource({ hosted: props.sermon.hosted, youtubeId: props.sermon.videoProvider === 'youtube' ? props.sermon.videoId : null }))

const playUrl = ref<string | null>(null)
const starting = ref(false)
const failure = ref('')
watch(() => props.sermon.slug, () => { playUrl.value = null })

const start = async () => {
  starting.value = true
  failure.value = ''
  try {
    playUrl.value = (await $fetch<{ url: string }>(`/api/sermons/${encodeURIComponent(props.sermon.slug)}/playback`)).url
  }
  catch (error) {
    failure.value = apiErrorMessage(error, 'The video could not start. Try again in a moment.')
  }
  finally {
    starting.value = false
  }
}
</script>
