<template>
  <section v-if="meetings.length" id="live" class="bg-secondary-900 py-10 px-6 scroll-mt-20">
    <div class="max-w-6xl mx-auto space-y-10">
      <div v-for="meeting in meetings" :key="meeting.id" class="grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
        <div v-if="meeting.youtube" class="lg:col-span-3">
          <LiveYouTubePlayer :youtube="meeting.youtube" :title="meeting.title ?? 'Live meeting'" />
        </div>

        <div :class="meeting.youtube ? 'lg:col-span-2' : 'lg:col-span-5'">
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <UBadge v-if="isLive(meeting)" color="error" variant="solid" icon="i-lucide-radio">Live now</UBadge>
            <UBadge v-else color="neutral" variant="solid" icon="i-lucide-clock">Starts at {{ formatLiveInstant(meeting.startsAt, timeZone) }}</UBadge>
            <UBadge v-if="meeting.visibility === 'members'" color="neutral" variant="subtle" icon="i-lucide-lock">Members only</UBadge>
          </div>
          <h2 class="text-3xl font-bold font-serif text-white leading-tight mb-2">{{ meeting.title ?? 'Live meeting for members' }}</h2>
          <p class="text-white/60 text-sm mb-5">
            {{ formatLiveInstant(meeting.startsAt, timeZone) }}–{{ formatLiveInstant(meeting.endsAt, timeZone) }} · {{ LIVE_KIND_LABELS[meeting.kind] }}
          </p>

          <UButton
            v-if="meeting.kind === 'meet' && meeting.link"
            :to="meeting.link"
            target="_blank"
            size="lg"
            icon="i-lucide-video"
            trailing-icon="i-lucide-external-link"
            class="uppercase tracking-wide font-bold"
          >
            Join Live Meeting
          </UButton>
          <UButton
            v-else-if="meeting.kind === 'youtube' && meeting.link"
            :to="meeting.link"
            target="_blank"
            variant="link"
            color="neutral"
            trailing-icon="i-lucide-external-link"
            class="px-0 text-white/70"
          >
            Open on YouTube
          </UButton>
          <template v-else>
            <UButton v-if="!auth.isAuthenticated" :to="{ path: '/login', query: { redirect: '/teaching#live' } }" size="lg" icon="i-lucide-log-in" class="uppercase tracking-wide font-bold">
              Sign in to join
            </UButton>
            <p v-else class="text-white/70 text-sm">This live meeting is for members.</p>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { LIVE_KIND_LABELS, type LiveNowView } from '#shared/live'

defineProps<{ meetings: LiveNowView[], timeZone: string }>()

const auth = useAuthStore()

// Ticks so "Starts at" becomes "Live now" without a reload.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => now.value = Date.now(), 15_000)
})
onBeforeUnmount(() => clearInterval(timer))

const isLive = (meeting: LiveNowView) => new Date(meeting.startsAt).getTime() <= now.value
</script>
