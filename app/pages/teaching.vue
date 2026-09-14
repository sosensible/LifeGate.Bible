<template>
  <div>
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">{{ auth.isAuthenticated ? 'Members Area' : 'Watch & Listen' }}</p>
        <h1 class="text-4xl font-bold font-serif text-white">Teaching</h1>
      </div>
    </div>

    <!-- Live stream -->
    <div class="bg-parchment-900 py-11 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="flex items-center gap-3 mb-4">
          <p class="text-gold-400 text-xs tracking-[0.15em] uppercase">Sunday Morning Sermon</p>
        </div>
        <div class="bg-black rounded-lg aspect-video max-w-3xl flex flex-col items-center justify-center gap-3 border border-white/10">
          <div class="w-16 h-16 rounded-full bg-gold-500/10 border-2 border-gold-500/40 flex items-center justify-center">
            <UIcon name="i-lucide-play" class="w-7 h-7 text-gold-400" />
          </div>
          <div class="text-center px-4">
            <p class="text-white/50 text-sm">Live stream embed goes here</p>
            <p class="text-white/30 text-xs">YouTube, Vimeo, Facebook Live, or other provider</p>
          </div>
        </div>
        <div class="flex gap-3 mt-5 flex-wrap">
          <UButton size="md" class="bg-gold-500 text-highlighted hover:bg-gold-600 uppercase tracking-wide font-bold">Watch Live</UButton>
          <UButton size="md" variant="outline" class="text-gold-400 ring-gold-500/40 hover:bg-gold-500/10 uppercase tracking-wide font-semibold">Download Sermon Notes (PDF)</UButton>
        </div>
      </div>
    </div>

    <!-- Archive -->
    <div class="bg-default py-14 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
          <h2 class="text-3xl font-bold font-serif text-highlighted">Recent Messages</h2>
          <p class="text-muted text-sm">{{ filteredSermons.length }} of {{ visibleSermons.length }} messages</p>
        </div>

        <!-- Filter toolbar -->
        <div class="space-y-3 mb-4">
          <div class="relative">
            <UIcon name="i-lucide-search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-600 pointer-events-none" />
            <input
              v-model="search"
              type="text"
              placeholder="Search title, verse, tag, date..."
              class="w-full pl-11 pr-4 py-2.5 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select v-model="selectedSeries" class="w-full px-3 py-2.5 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">All Series</option>
              <option v-for="opt in seriesOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <select v-model="selectedBook" class="w-full px-3 py-2.5 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">All Books</option>
              <option v-for="opt in bookOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <select v-model="selectedTag" class="w-full px-3 py-2.5 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">All Topics</option>
              <option v-for="opt in tagOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <UPopover>
              <UButton
                icon="i-lucide-calendar"
                color="neutral"
                variant="outline"
                class="w-full justify-start font-normal ring-default"
                :class="dateLabel ? 'text-default' : 'text-dimmed'"
              >
                {{ dateLabel || 'Any dates' }}
              </UButton>
              <template #content>
                <UCalendar v-model="dateRange" range class="p-2" />
              </template>
            </UPopover>
          </div>
        </div>

        <div v-if="hasActiveFilters" class="flex flex-wrap items-center gap-2 mb-8">
          <span class="text-muted text-xs font-semibold uppercase tracking-wide mr-1">Filters:</span>
          <button
            v-for="f in activeFilters"
            :key="f.key"
            class="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-semibold hover:bg-primary/20 transition-colors"
            @click="f.clear()"
          >
            {{ f.label }}
            <UIcon name="i-lucide-x" class="w-3 h-3" />
          </button>
          <button class="text-muted text-xs font-bold hover:text-highlighted hover:underline ml-1" @click="clearFilters">
            Clear all
          </button>
        </div>
        <div v-else class="mb-8"></div>

        <!-- Empty state -->
        <div v-if="filteredSermons.length === 0" class="text-center py-16">
          <p class="font-serif text-xl text-muted mb-2">No messages found</p>
          <p class="text-muted text-sm">Try a different search or clear the filters</p>
        </div>

        <!-- Grid -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="s in filteredSermons" :key="s.id" class="bg-elevated rounded-lg overflow-hidden shadow-sm border border-default flex flex-col">
            <div class="h-32 flex items-center justify-center relative shrink-0" :style="{ backgroundColor: s.color }">
              <UIcon name="i-lucide-play" class="w-9 h-9 text-white/30" />
              <span v-if="auth.isAuthenticated && s.isPublic" class="absolute top-2.5 left-2.5 bg-white/90 text-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-sm">Public</span>
              <div class="absolute bottom-2.5 right-2.5 flex gap-1.5">
                <span v-for="f in s.formats" :key="f" class="bg-black/55 text-white px-2 py-0.5 text-[10px] font-semibold rounded-sm">{{ f }}</span>
              </div>
            </div>
            <div class="p-5 flex flex-col flex-1">
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase mb-1.5">{{ s.series }}</p>
              <h3 class="font-serif text-lg font-bold text-highlighted leading-tight mb-1.5">{{ s.title }}</h3>
              <p class="text-primary text-xs font-semibold mb-1.5">{{ s.reference }}</p>
              <p class="text-muted text-xs mb-3">{{ s.date }} · {{ s.pastor }}</p>
              <div v-if="s.tags.length" class="flex flex-wrap gap-1.5 mb-4">
                <button
                  v-for="t in s.tags"
                  :key="t"
                  class="bg-muted text-toned px-2 py-0.5 text-[10px] font-semibold rounded-full hover:bg-primary hover:text-inverted transition-colors"
                  @click="selectedTag = t"
                >
                  {{ t }}
                </button>
              </div>
              <span class="text-primary text-xs font-bold border-b-2 border-gold-500 pb-0.5 cursor-pointer mt-auto self-start">Watch / Download →</span>
            </div>
          </div>
        </div>

        <!-- Members-only nudge -->
        <div v-if="!auth.isAuthenticated && hiddenCount > 0" class="mt-10 border-l-4 border-gold-500 bg-muted rounded-r-lg px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <p class="text-toned">
            {{ hiddenCount }} more {{ hiddenCount === 1 ? 'message is' : 'messages are' }} available to members.
            Sign in to view the full archive.
          </p>
          <UButton to="/login" color="secondary" class="shrink-0">Member Login</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DateFormatter, getLocalTimeZone, type DateValue } from '@internationalized/date'

// Public page: signed-out visitors see only sermons marked `isPublic`; signed-in
// members see the full archive. (Server-enforced visibility comes with the portal.)
definePageMeta({
  layout: 'default',
})

const auth = useAuthStore()

onMounted(() => {
  auth.initAuth()
})

// Demo data until live sermons are wired in. `isPublic` controls what shows to
// signed-out visitors; `books`/`reference`/`tags` drive search and filtering.
const sermons = [
  { id: 1, title: 'The Good Shepherd', series: 'Gospel of John', reference: 'John 10:1–18', books: ['John'], tags: ['Shepherd', 'Comfort', 'Salvation'], date: 'June 22, 2025', dateISO: '2025-06-22', pastor: 'Pastor Dave', formats: ['Video', 'PDF'], color: '#1A5C30', isPublic: true },
  { id: 2, title: 'Walking in the Light', series: 'Gospel of John', reference: 'John 8:12', books: ['John'], tags: ['Discipleship', 'Holiness'], date: 'June 15, 2025', dateISO: '2025-06-15', pastor: 'Pastor Dave', formats: ['Video', 'PDF'], color: '#7B1828', isPublic: false },
  { id: 3, title: 'Bread of Life', series: 'Gospel of John', reference: 'John 6:35–51', books: ['John'], tags: ['Salvation', 'Faith'], date: 'June 8, 2025', dateISO: '2025-06-08', pastor: 'Pastor Dave', formats: ['Video', 'Audio', 'PDF'], color: '#256035', isPublic: true },
  { id: 4, title: 'Grace Abounding', series: 'Romans: The Gospel Unveiled', reference: 'Romans 5:1–11', books: ['Romans'], tags: ['Grace', 'Justification'], date: 'June 1, 2025', dateISO: '2025-06-01', pastor: 'Pastor Dave', formats: ['Video', 'PDF'], color: '#5D1220', isPublic: false },
  { id: 5, title: 'Justification by Faith', series: 'Romans: The Gospel Unveiled', reference: 'Romans 3:21–31', books: ['Romans'], tags: ['Faith', 'Justification', 'Grace'], date: 'May 25, 2025', dateISO: '2025-05-25', pastor: 'Pastor Dave', formats: ['Video'], color: '#4A3C1A', isPublic: false },
  { id: 6, title: 'The Love Chapter', series: 'Special Series', reference: '1 Corinthians 13', books: ['1 Corinthians'], tags: ['Love', 'Relationships'], date: 'May 18, 2025', dateISO: '2025-05-18', pastor: 'Guest Speaker', formats: ['Video', 'Audio'], color: '#2A3C6C', isPublic: true },
]

const search = ref('')
const selectedSeries = ref('')
const selectedBook = ref('')
const selectedTag = ref('')

// Date range uses Nuxt UI's UCalendar (CalendarDate values); we derive plain
// ISO strings ('YYYY-MM-DD') for filtering and a friendly label for the trigger.
const df = new DateFormatter('en-US', { dateStyle: 'medium' })
const tz = getLocalTimeZone()
const dateRange = shallowRef<{ start?: DateValue, end?: DateValue }>({ start: undefined, end: undefined })

const dateFrom = computed(() => dateRange.value.start?.toString() ?? '')
const dateTo = computed(() => dateRange.value.end?.toString() ?? '')
const dateLabel = computed(() => {
  const { start, end } = dateRange.value
  if (!start) return ''
  if (!end) return df.format(start.toDate(tz))
  return `${df.format(start.toDate(tz))} – ${df.format(end.toDate(tz))}`
})

const visibleSermons = computed(() =>
  auth.isAuthenticated ? sermons : sermons.filter(s => s.isPublic),
)

const hiddenCount = computed(() => sermons.length - visibleSermons.value.length)

// Filter options are derived from what the viewer can actually see.
const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))
const seriesOptions = computed(() => uniqueSorted(visibleSermons.value.map(s => s.series)))
const bookOptions = computed(() => uniqueSorted(visibleSermons.value.flatMap(s => s.books)))
const tagOptions = computed(() => uniqueSorted(visibleSermons.value.flatMap(s => s.tags)))

const hasActiveFilters = computed(() =>
  !!(search.value || selectedSeries.value || selectedBook.value || selectedTag.value
    || dateFrom.value || dateTo.value),
)

// Each active filter as a removable chip (label + its own clear action).
const activeFilters = computed(() => {
  const chips: { key: string, label: string, clear: () => void }[] = []
  if (search.value) chips.push({ key: 'search', label: `“${search.value}”`, clear: () => (search.value = '') })
  if (selectedSeries.value) chips.push({ key: 'series', label: selectedSeries.value, clear: () => (selectedSeries.value = '') })
  if (selectedBook.value) chips.push({ key: 'book', label: selectedBook.value, clear: () => (selectedBook.value = '') })
  if (selectedTag.value) chips.push({ key: 'tag', label: selectedTag.value, clear: () => (selectedTag.value = '') })
  if (dateRange.value.start) chips.push({ key: 'from', label: `From ${df.format(dateRange.value.start.toDate(tz))}`, clear: () => (dateRange.value = { start: undefined, end: dateRange.value.end }) })
  if (dateRange.value.end) chips.push({ key: 'to', label: `To ${df.format(dateRange.value.end.toDate(tz))}`, clear: () => (dateRange.value = { start: dateRange.value.start, end: undefined }) })
  return chips
})

function clearFilters() {
  search.value = ''
  selectedSeries.value = ''
  selectedBook.value = ''
  selectedTag.value = ''
  dateRange.value = { start: undefined, end: undefined }
}

const filteredSermons = computed(() => {
  const q = search.value.trim().toLowerCase()
  return visibleSermons.value
    .filter((s) => {
      if (selectedSeries.value && s.series !== selectedSeries.value) return false
      if (selectedBook.value && !s.books.includes(selectedBook.value)) return false
      if (selectedTag.value && !s.tags.includes(selectedTag.value)) return false
      // dateISO is 'YYYY-MM-DD', so lexical comparison is chronological.
      if (dateFrom.value && s.dateISO < dateFrom.value) return false
      if (dateTo.value && s.dateISO > dateTo.value) return false
      if (q) {
        const haystack = [s.title, s.series, s.pastor, s.reference, s.date, ...s.books, ...s.tags]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO))
})
</script>
