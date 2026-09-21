<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-5xl mx-auto flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Area</p>
          <h1 class="text-4xl font-bold font-serif text-white">Church Calendar</h1>
        </div>

        <!-- Quiet on purpose: only editors see it, and it is housekeeping
             rather than something a member came here to do. No `color`, because
             a neutral outline fills itself white and disappears on this header.
             Ghost drops the ring; the muted white still reads at 6:1. -->
        <UButton
          v-if="canRefresh"
          size="xs"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="refreshing"
          class="text-white/70 hover:text-white hover:bg-white/10"
          @click="refresh"
        >
          Refresh from Google
        </UButton>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6 space-y-6">
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="apiErrorMessage(error, 'The calendar could not be loaded.')"
      />

      <div v-else-if="status === 'pending'" class="space-y-3">
        <USkeleton v-for="n in 4" :key="n" class="h-20 w-full" />
      </div>

      <template v-else-if="data">
        <UTabs v-model="view" :items="tabs" :content="false" class="w-full" />

        <!-- Upcoming -->
        <div v-if="view === 'upcoming'">
          <div v-if="!data.events.length" class="bg-muted border border-default rounded-lg p-8 text-center">
            <p class="text-toned">Nothing is on the calendar for the year ahead.</p>
          </div>

          <div v-else class="space-y-8">
            <section v-for="month in months" :key="month.key">
              <h2 class="text-gold-600 text-[11px] font-bold tracking-[0.15em] uppercase mb-3">{{ month.label }}</h2>
              <ul class="space-y-3">
                <li v-for="event in month.events" :key="event.id">
                  <CalendarEntry :event="event" :time-zone="data.timeZone" />
                </li>
              </ul>
            </section>
          </div>
        </div>

        <!-- Month grid, with the chosen day's events beside it -->
        <div v-else class="flex flex-col lg:flex-row gap-8">
          <!-- Centred on a phone, where the grid sits alone above the day's
               events; aligned to the top left once it shares a row with them. -->
          <UCalendar v-model="selected" :year-controls="false" class="shrink-0 self-center lg:self-start">
            <template #day="{ day }">
              <UChip
                :show="eventsByDay.has(day.toString())"
                size="xs"
                :ui="{ base: isSelected(day) ? 'bg-white ring-0' : 'bg-gold-600 ring-0' }"
              >
                <span>{{ day.day }}</span>
              </UChip>
            </template>
          </UCalendar>

          <div class="min-w-0 flex-1">
            <h2 class="font-serif text-xl font-bold text-highlighted mb-3">{{ selectedLabel }}</h2>
            <ul v-if="selectedEvents.length" class="space-y-3">
              <li v-for="event in selectedEvents" :key="event.id">
                <CalendarEntry :event="event" :time-zone="data.timeZone" :show-date="false" />
              </li>
            </ul>
            <div v-else class="bg-muted border border-default rounded-lg p-6">
              <p class="text-toned text-sm">Nothing is scheduled for this day.</p>
            </div>
          </div>
        </div>

        <p class="text-muted text-xs">
          Times are {{ zoneLabel }}. Read from Google Calendar {{ formatRelative(data.fetchedAt) }}.
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date'
import { dayKey, groupByDay, groupByMonth } from '#shared/calendar'

definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

useHead({ title: 'Church Calendar' })

const auth = useAuthStore()
const toast = useToast()
const canRefresh = computed(() => auth.can({ liveMeeting: ['manage'] }))

const { data, status, error, refresh: reload } = await useFetch('/api/calendar')

const view = ref<'upcoming' | 'month'>('upcoming')
const tabs = [
  { label: 'Upcoming', value: 'upcoming', icon: 'i-lucide-list' },
  { label: 'Month', value: 'month', icon: 'i-lucide-calendar-days' },
]

const months = computed(() => (data.value ? groupByMonth(data.value.events, data.value.timeZone) : []))
const eventsByDay = computed(() => (data.value ? groupByDay(data.value.events, data.value.timeZone) : new Map()))

// Open the month view on the next day that actually has something on it, so the
// panel beside the grid is not empty the moment it is opened.
const firstDay = computed(() => {
  const next = data.value?.events[0]
  if (!next) return today(getLocalTimeZone())
  const [year, month, day] = dayKey(next.start, data.value!.timeZone).split('-').map(Number)
  return new CalendarDate(year!, month!, day!)
})
// Shallow, so the date keeps its class: Vue's deep unwrapping would reduce a
// CalendarDate to a plain object and the calendar would not accept it.
const selected = shallowRef(firstDay.value)
watch(firstDay, value => { selected.value = value })

// The marker has to stay visible on the chosen day, where the cell turns
// green: gold reads on the page, white reads on the green.
const isSelected = (day: { toString: () => string }) => day.toString() === selected.value.toString()

const selectedEvents = computed(() => eventsByDay.value.get(selected.value.toString()) ?? [])
const selectedLabel = computed(() =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .format(selected.value.toDate(data.value?.timeZone ?? getLocalTimeZone())))

// The church's own zone, named the way a person would say it.
const zoneLabel = computed(() => {
  if (!data.value) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: data.value.timeZone, timeZoneName: 'long' })
    .formatToParts(new Date())
  return parts.find(part => part.type === 'timeZoneName')?.value ?? data.value.timeZone
})

const refreshing = ref(false)
const refresh = async () => {
  refreshing.value = true
  try {
    await $fetch('/api/admin/calendar/refresh', { method: 'POST' })
    await reload()
    toast.add({ title: 'Calendar updated from Google', icon: 'i-lucide-check', color: 'success' })
  }
  catch (error) {
    toast.add({ title: 'The calendar could not be refreshed', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    refreshing.value = false
  }
}
</script>
