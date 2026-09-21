<template>
  <!-- One event, used by both the upcoming list and the day panel of the month
       view. The date block is dropped in the day panel, where the heading above
       has already said which day it is. -->
  <div class="flex items-stretch gap-4 bg-elevated border border-default rounded-lg overflow-hidden">
    <div
      v-if="showDate"
      class="bg-primary-800 text-white shrink-0 w-16 flex flex-col items-center justify-center py-3"
    >
      <span class="text-gold-400 text-[10px] font-bold tracking-[0.15em] uppercase">{{ weekday }}</span>
      <span class="font-serif text-2xl font-bold leading-tight">{{ dayOfMonth }}</span>
    </div>

    <div class="min-w-0 flex-1 py-3 pe-4" :class="showDate ? '' : 'ps-4'">
      <h3 class="font-serif font-bold text-highlighted">{{ event.title }}</h3>

      <p class="text-toned text-sm mt-0.5 flex items-center gap-1.5">
        <UIcon name="i-lucide-clock" class="size-3.5 shrink-0 text-muted" />
        {{ formatEventTime(event, timeZone) }}
      </p>

      <p v-if="event.location" class="text-muted text-sm mt-0.5 flex items-start gap-1.5">
        <UIcon name="i-lucide-map-pin" class="size-3.5 shrink-0 mt-0.5" />
        <span class="min-w-0">{{ event.location }}</span>
      </p>

      <p v-if="event.description" class="text-toned text-sm mt-2 whitespace-pre-line">{{ event.description }}</p>

      <UButton
        v-if="event.meetUrl"
        :to="event.meetUrl"
        target="_blank"
        rel="noopener"
        size="xs"
        color="primary"
        variant="soft"
        icon="i-lucide-video"
        class="mt-2"
      >
        Join online
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type CalendarEvent, formatEventTime } from '#shared/calendar'

const props = withDefaults(defineProps<{
  event: CalendarEvent
  timeZone: string
  showDate?: boolean
}>(), { showDate: true })

const part = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: props.timeZone, ...options }).format(new Date(props.event.start))

const weekday = computed(() => part({ weekday: 'short' }))
const dayOfMonth = computed(() => part({ day: 'numeric' }))
</script>
