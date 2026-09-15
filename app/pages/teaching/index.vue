<template>
  <div>
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">{{ auth.isMember ? 'Members Area' : 'Watch & Listen' }}</p>
        <h1 class="text-4xl font-bold font-serif text-white">Teaching</h1>
      </div>
    </div>

    <LiveMeetings v-if="live" :meetings="live.meetings" :time-zone="live.timeZone" />

    <!-- Latest message -->
    <div v-if="latest" class="bg-parchment-900 py-11 px-6">
      <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
        <div class="lg:col-span-3">
          <SermonPlayer :sermon="latest" />
        </div>
        <div class="lg:col-span-2">
          <p class="text-gold-400 text-xs tracking-[0.15em] uppercase mb-3">Latest Message</p>
          <p v-if="latest.series" class="text-white/60 text-xs uppercase tracking-wide mb-1">{{ latest.series.name }}</p>
          <h2 class="text-3xl font-bold font-serif text-white leading-tight mb-2">{{ latest.title }}</h2>
          <p v-if="latest.scripture" class="text-gold-300 text-sm font-semibold mb-1">{{ latest.scripture }}</p>
          <p class="text-white/60 text-sm mb-5">{{ formatSermonDate(latest.preachedOn) }} · {{ latest.speaker }}</p>
          <UButton :to="`/teaching/${latest.slug}`" variant="outline" class="text-gold-400 ring-gold-500/40 hover:bg-gold-500/10 uppercase tracking-wide font-semibold">
            Details and notes
          </UButton>
        </div>
      </div>
    </div>

    <!-- Archive -->
    <div class="bg-default py-14 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
          <h2 class="text-3xl font-bold font-serif text-highlighted">Recent Messages</h2>
          <p v-if="sermons.length" class="text-muted text-sm">{{ filtered.length }} of {{ sermons.length }} messages</p>
        </div>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" description="Messages could not be loaded. Please try again." class="mb-8" />

        <template v-else-if="sermons.length">
          <!-- Filters -->
          <div class="space-y-3 mb-4">
            <UInput v-model="search" icon="i-lucide-search" placeholder="Search title, passage, speaker, topic..." size="lg" class="w-full" />
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <USelect v-model="selectedSeries" :items="seriesOptions" placeholder="All series" class="w-full" />
              <USelect v-model="selectedBook" :items="bookOptions" placeholder="All books" class="w-full" />
              <USelect v-model="selectedTag" :items="tagOptions" placeholder="All topics" class="w-full" />
              <UPopover>
                <UButton icon="i-lucide-calendar" color="neutral" variant="outline" class="w-full justify-start font-normal" :class="dateLabel ? 'text-default' : 'text-dimmed'">
                  {{ dateLabel || 'Any dates' }}
                </UButton>
                <template #content>
                  <UCalendar v-model="dateRange" range class="p-2" />
                </template>
              </UPopover>
            </div>
          </div>

          <div v-if="activeFilters.length" class="flex flex-wrap items-center gap-2 mb-8">
            <span class="text-muted text-xs font-semibold uppercase tracking-wide mr-1">Filters:</span>
            <UButton
              v-for="filter in activeFilters"
              :key="filter.key"
              size="xs"
              variant="soft"
              trailing-icon="i-lucide-x"
              class="rounded-full"
              @click="filter.clear()"
            >
              {{ filter.label }}
            </UButton>
            <UButton size="xs" variant="link" color="neutral" @click="clearFilters">Clear all</UButton>
          </div>
          <div v-else class="mb-8" />

          <div v-if="filtered.length === 0" class="text-center py-16">
            <p class="font-serif text-xl text-muted mb-2">No messages found</p>
            <p class="text-muted text-sm">Try a different search or clear the filters</p>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <SermonCard v-for="sermon in filtered" :key="sermon.id" :sermon="sermon" :show-visibility="auth.isMember" @tag="selectedTag = $event" />
          </div>
        </template>

        <div v-else class="text-center py-16">
          <p class="font-serif text-xl text-muted mb-2">No messages posted yet</p>
          <p class="text-muted text-sm">Check back after Sunday.</p>
        </div>

        <!-- Members-only nudge -->
        <div v-if="hiddenCount > 0" class="mt-10 border-l-4 border-gold-500 bg-muted rounded-r-lg px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <p class="text-toned">
            {{ hiddenCount }} more {{ hiddenCount === 1 ? 'message is' : 'messages are' }} available to members.
            <template v-if="!auth.isAuthenticated">Sign in to view the full archive.</template>
          </p>
          <UButton v-if="!auth.isAuthenticated" :to="{ path: '/login', query: { redirect: '/teaching' } }" color="secondary" class="shrink-0">Member Login</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DateFormatter, getLocalTimeZone, type DateValue } from '@internationalized/date'
import { byBibleOrder } from '#shared/bible'

// Public page. The server sends signed-out visitors only public messages, and
// members the full archive; members-only titles and videos never reach anyone else.
definePageMeta({
  layout: 'default',
})
useSeoMeta({ title: 'Teaching | Lifegate Baptist Church', description: 'Preaching, lessons and Bible studies from Lifegate Baptist Church.' })

const auth = useAuthStore()
const route = useRoute()

const [{ data, error }, { data: live }] = await Promise.all([useFetch('/api/sermons'), useLiveMeetings()])
const sermons = computed(() => data.value?.sermons ?? [])
const hiddenCount = computed(() => data.value?.hiddenCount ?? 0)
const latest = computed(() => sermons.value[0] ?? null)

// Filters can arrive in the link, e.g. /teaching?series=Gospel%20of%20John
const fromQuery = (key: string) => (typeof route.query[key] === 'string' ? route.query[key] : undefined)
const search = ref(fromQuery('q') ?? '')
const selectedSeries = ref<string | undefined>(fromQuery('series'))
const selectedBook = ref<string | undefined>(fromQuery('book'))
const selectedTag = ref<string | undefined>(fromQuery('tag'))

// Date range uses Nuxt UI's UCalendar (CalendarDate values); plain ISO strings
// ('YYYY-MM-DD') are derived for filtering and a friendly label for the trigger.
const df = new DateFormatter('en-US', { dateStyle: 'medium' })
const tz = getLocalTimeZone()
const dateRange = shallowRef<{ start: DateValue | undefined, end: DateValue | undefined }>({ start: undefined, end: undefined })

const dateFrom = computed(() => dateRange.value.start?.toString() ?? '')
const dateTo = computed(() => dateRange.value.end?.toString() ?? '')
const dateLabel = computed(() => {
  const { start, end } = dateRange.value
  if (!start) return ''
  if (!end) return df.format(start.toDate(tz))
  return `${df.format(start.toDate(tz))} – ${df.format(end.toDate(tz))}`
})

// Options come from what this viewer can actually see.
const unique = (values: string[]) => [...new Set(values)]
const seriesOptions = computed(() => unique(sermons.value.flatMap(s => s.series ? [s.series.name] : [])).sort((a, b) => a.localeCompare(b)))
const bookOptions = computed(() => unique(sermons.value.flatMap(s => s.books)).sort(byBibleOrder))
const tagOptions = computed(() => unique(sermons.value.flatMap(s => s.tags)).sort((a, b) => a.localeCompare(b)))

const activeFilters = computed(() => {
  const chips: { key: string, label: string, clear: () => void }[] = []
  if (search.value) chips.push({ key: 'search', label: `“${search.value}”`, clear: () => (search.value = '') })
  if (selectedSeries.value) chips.push({ key: 'series', label: selectedSeries.value, clear: () => (selectedSeries.value = undefined) })
  if (selectedBook.value) chips.push({ key: 'book', label: selectedBook.value, clear: () => (selectedBook.value = undefined) })
  if (selectedTag.value) chips.push({ key: 'tag', label: selectedTag.value, clear: () => (selectedTag.value = undefined) })
  if (dateRange.value.start) chips.push({ key: 'from', label: `From ${df.format(dateRange.value.start.toDate(tz))}`, clear: () => (dateRange.value = { start: undefined, end: dateRange.value.end }) })
  if (dateRange.value.end) chips.push({ key: 'to', label: `To ${df.format(dateRange.value.end.toDate(tz))}`, clear: () => (dateRange.value = { start: dateRange.value.start, end: undefined }) })
  return chips
})

function clearFilters() {
  search.value = ''
  selectedSeries.value = undefined
  selectedBook.value = undefined
  selectedTag.value = undefined
  dateRange.value = { start: undefined, end: undefined }
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return sermons.value.filter((s) => {
    if (selectedSeries.value && s.series?.name !== selectedSeries.value) return false
    if (selectedBook.value && !s.books.includes(selectedBook.value)) return false
    if (selectedTag.value && !s.tags.includes(selectedTag.value)) return false
    // 'YYYY-MM-DD' compares chronologically as text.
    if (dateFrom.value && s.preachedOn < dateFrom.value) return false
    if (dateTo.value && s.preachedOn > dateTo.value) return false
    if (q) {
      const haystack = [s.title, s.series?.name, s.speaker, s.scripture, formatSermonDate(s.preachedOn), ...s.books, ...s.tags]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
})
</script>
