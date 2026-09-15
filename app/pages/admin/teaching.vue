<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Church Office</p>
          <h1 class="text-4xl font-bold font-serif text-white">Teaching</h1>
        </div>
        <UButton v-if="canCreate" color="secondary" icon="i-lucide-plus" @click="openEditor(null)">Add message</UButton>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-12">
        <AdminLiveMeetingsSection v-if="canScheduleLive" />

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Teaching could not be loaded.')" />

        <section v-else>
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <UInput v-model="search" icon="i-lucide-search" placeholder="Search title, speaker, series or passage..." class="w-full max-w-md" />
            <p class="text-muted text-sm">{{ drafts }} {{ drafts === 1 ? 'draft' : 'drafts' }} · {{ sermons.length }} total</p>
          </div>

          <div class="bg-elevated rounded-lg border border-default overflow-x-auto">
            <UTable :data="filtered" :columns="columns" :empty="sermons.length ? 'Nothing matches that search.' : 'No messages yet. Add the first one.'">
              <template #date-cell="{ row }">
                <span class="text-toned whitespace-nowrap">{{ formatSermonDate(row.original.preachedOn) }}</span>
              </template>
              <template #title-cell="{ row }">
                <button type="button" class="text-left group" @click="openEditor(row.original)">
                  <span class="block font-bold text-highlighted group-hover:text-primary">{{ row.original.title }}</span>
                  <span class="block text-muted text-xs">{{ [row.original.series?.name, row.original.scripture].filter(Boolean).join(' · ') }}</span>
                </button>
              </template>
              <template #speaker-cell="{ row }">
                <span class="text-toned">{{ row.original.speaker }}</span>
              </template>
              <template #video-cell="{ row }">
                <UIcon v-if="row.original.videoId" name="i-lucide-circle-play" class="w-4 h-4 text-primary" aria-label="Has video" />
                <span v-else class="text-muted text-xs">None</span>
              </template>
              <template #access-cell="{ row }">
                <UBadge variant="subtle" :color="row.original.visibility === 'public' ? 'primary' : 'neutral'" :icon="row.original.visibility === 'public' ? 'i-lucide-globe' : 'i-lucide-lock'">
                  {{ row.original.visibility === 'public' ? 'Everyone' : 'Members' }}
                </UBadge>
              </template>
              <template #status-cell="{ row }">
                <UBadge variant="subtle" :color="row.original.status === 'published' ? 'success' : 'warning'">
                  {{ row.original.status === 'published' ? 'Published' : 'Draft' }}
                </UBadge>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex gap-1 justify-end">
                  <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-external-link" :to="`/teaching/${row.original.slug}`" :aria-label="`View ${row.original.title}`" />
                  <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${row.original.title}`" @click="openEditor(row.original)" />
                </div>
              </template>
            </UTable>
          </div>
        </section>

        <!-- Series -->
        <section>
          <h2 class="font-serif text-2xl font-bold text-highlighted mb-1">Series</h2>
          <p class="text-toned text-sm mb-4">Create a series from a message's form. Removing one keeps its messages.</p>
          <ul class="bg-elevated rounded-lg border border-default divide-y divide-default">
            <li v-if="!series.length" class="p-4 text-muted text-sm">No series yet.</li>
            <li v-for="item in series" :key="item.id" class="p-4 flex flex-wrap items-center justify-between gap-3">
              <template v-if="renaming?.id === item.id">
                <UInput v-model="renaming.name" class="flex-1 min-w-48" autofocus @keydown.enter.prevent="saveRename" @keydown.esc="renaming = null" />
                <div class="flex gap-2">
                  <UButton size="sm" :loading="seriesBusy" @click="saveRename">Save</UButton>
                  <UButton size="sm" variant="ghost" color="neutral" @click="renaming = null">Cancel</UButton>
                </div>
              </template>
              <template v-else>
                <div>
                  <p class="font-bold text-highlighted">{{ item.name }}</p>
                  <p class="text-muted text-xs">{{ item.sermonCount }} {{ item.sermonCount === 1 ? 'message' : 'messages' }}</p>
                </div>
                <div class="flex gap-1">
                  <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" :aria-label="`Rename ${item.name}`" @click="renaming = { id: item.id, name: item.name }" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" :aria-label="`Remove ${item.name}`" @click="removingSeries = item" />
                </div>
              </template>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <AdminSermonSlideover
      v-model:open="editorOpen"
      :sermon="editing"
      :series="series"
      :speakers="speakers"
      :speaker-choices="speakerChoices"
      @saved="onSaved"
      @removed="onRemoved"
      @series-created="series.push($event)"
    />

    <UModal
      :open="removingSeries !== null"
      title="Remove this series?"
      :description="removingSeries ? `${removingSeries.name} will be removed. Its ${removingSeries.sermonCount} ${removingSeries.sermonCount === 1 ? 'message is' : 'messages are'} kept, with no series.` : ''"
      @update:open="value => { if (!value) removingSeries = null }"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" @click="removingSeries = null">Keep</UButton>
        <UButton color="error" :loading="seriesBusy" @click="removeSeries">Remove</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminSermonView, SeriesView } from '#shared/sermons'

definePageMeta({
  middleware: 'auth',
  permission: { sermon: ['update'] },
  layout: 'default',
})
useSeoMeta({ title: 'Teaching | Lifegate Baptist Church' })

const auth = useAuthStore()
const toast = useToast()
const canCreate = computed(() => auth.can({ sermon: ['create'] }))
const canScheduleLive = computed(() => auth.can({ liveMeeting: ['manage'] }))

const [{ data: sermonData, error }, { data: seriesData, refresh: refreshSeries }, { data: speakerData }] = await Promise.all([
  useFetch('/api/admin/sermons'),
  useFetch('/api/admin/sermon-series'),
  useFetch('/api/admin/sermons/speakers'),
])
const speakerChoices = computed(() => speakerData.value?.speakers ?? [])

const sermons = ref<AdminSermonView[]>(sermonData.value?.sermons ?? [])
const series = ref<SeriesView[]>(seriesData.value?.series ?? [])
watch(sermonData, value => sermons.value = value?.sermons ?? [])
watch(seriesData, value => series.value = value?.series ?? [])

// Most recent speakers first, to suggest in the form.
const speakers = computed(() => [...new Set(sermons.value.map(s => s.speaker))])
const drafts = computed(() => sermons.value.filter(s => s.status === 'draft').length)

const columns: TableColumn<AdminSermonView>[] = [
  { id: 'date', header: 'Date' },
  { id: 'title', header: 'Message' },
  { id: 'speaker', header: 'Speaker' },
  { id: 'video', header: 'Video' },
  { id: 'access', header: 'Who can watch' },
  { id: 'status', header: 'Status' },
  { id: 'actions', header: '' },
]

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return sermons.value
  return sermons.value.filter(s =>
    [s.title, s.speaker, s.series?.name, s.scripture].some(value => value?.toLowerCase().includes(q)),
  )
})

const editorOpen = ref(false)
const editing = ref<AdminSermonView | null>(null)
const openEditor = (sermon: AdminSermonView | null) => {
  editing.value = sermon
  editorOpen.value = true
}

const newestFirst = (a: AdminSermonView, b: AdminSermonView) => b.preachedOn.localeCompare(a.preachedOn)

const onSaved = (saved: AdminSermonView) => {
  sermons.value = [...sermons.value.filter(s => s.id !== saved.id), saved].sort(newestFirst)
  refreshSeries()
}

const onRemoved = (id: string) => {
  sermons.value = sermons.value.filter(s => s.id !== id)
  editing.value = null
  refreshSeries()
}

// Series
const renaming = ref<{ id: string, name: string } | null>(null)
const removingSeries = ref<SeriesView | null>(null)
const seriesBusy = ref(false)

const saveRename = async () => {
  if (!renaming.value) return
  seriesBusy.value = true
  try {
    const { series: updated } = await $fetch(`/api/admin/sermon-series/${renaming.value.id}`, { method: 'PATCH', body: { name: renaming.value.name } })
    sermons.value = sermons.value.map(s => s.series?.id === updated.id ? { ...s, series: { id: updated.id, name: updated.name } } : s)
    renaming.value = null
    await refreshSeries()
  }
  catch (err) {
    toast.add({ title: 'Not renamed', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    seriesBusy.value = false
  }
}

const removeSeries = async () => {
  const item = removingSeries.value
  if (!item) return
  seriesBusy.value = true
  try {
    await $fetch(`/api/admin/sermon-series/${item.id}`, { method: 'DELETE' })
    sermons.value = sermons.value.map(s => s.series?.id === item.id ? { ...s, series: null } : s)
    removingSeries.value = null
    await refreshSeries()
  }
  catch (err) {
    toast.add({ title: 'Not removed', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    seriesBusy.value = false
  }
}
</script>
