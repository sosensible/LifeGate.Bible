<template>
  <UModal v-model:open="open" title="Import videos from the folder" description="Videos copied onto the church server by hand, waiting to be matched to a teaching." :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <div class="space-y-4">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />

        <div v-if="scan" class="text-muted space-y-1 text-sm">
          <p>Copy the video files into <code class="rounded bg-muted px-1.5 py-0.5 text-xs">{{ scan.directory }}</code>, then press Scan again. Name each one <strong>2026-11-01_Title.mov</strong> for the best match. Each file is checked, filed in its own place and then sent on to the video host.</p>
        </div>

        <p v-if="loading" class="text-muted text-sm">Looking in the folder…</p>
        <p v-else-if="scan && !scan.files.length" class="text-muted rounded-lg border border-default p-4 text-sm">No videos are waiting. Supported: {{ VIDEO_EXTENSIONS.join(', ') }}.</p>

        <UAlert
          v-if="!loading && scan && scan.files.length && !scan.teachings.length"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          title="There are no teachings yet"
          :description="canCreate ? 'A video is filed under a teaching. Add one for each video below: its title, date and who taught.' : 'A video is filed under a teaching, and none exist yet. Ask someone who can add teachings to add them.'"
        />

        <ul v-if="!loading && scan && scan.files.length" class="space-y-3">
          <li v-for="file in scan.files" :key="file.name" class="space-y-3 rounded-lg border border-default p-4">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-highlighted truncate font-medium">{{ file.name }}</p>
                <p class="text-muted text-xs">
                  {{ formatSize(file.size) }}<template v-if="file.meta.durationSeconds"> · {{ formatDuration(file.meta.durationSeconds) }}</template>
                  · <span :title="sourceHelp[file.date.source]">{{ file.date.date }} <UBadge size="sm" variant="subtle" :color="file.date.source === 'file-date' ? 'warning' : 'neutral'">{{ sourceLabel[file.date.source] }}</UBadge></span>
                  <template v-if="file.meta.location"> · <span title="Where the video says it was recorded">{{ file.meta.location.latitude.toFixed(3) }}, {{ file.meta.location.longitude.toFixed(3) }}</span></template>
                </p>
              </div>
              <UBadge v-if="state[file.name]?.done" color="success" variant="subtle" icon="i-lucide-circle-check">Filed</UBadge>
            </div>

            <template v-if="!state[file.name]?.done">
              <UFormField label="Which teaching is this?">
                <USelectMenu v-model="choice[file.name]" :items="itemsFor(file)" value-key="value" placeholder="Choose a teaching" searchable class="w-full" />
              </UFormField>
              <UButton v-if="canCreate" size="xs" color="neutral" variant="link" icon="i-lucide-plus" class="-mt-1" @click="startTeaching(file)">Not in the list? Add a teaching for this video</UButton>
              <UAlert v-if="chosen(file)?.hasCopy" color="warning" variant="subtle" icon="i-lucide-triangle-alert" description="This teaching already has a copy on the church server. Importing replaces it." />
              <UAlert v-if="state[file.name]?.error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="state[file.name]?.error" />
              <div class="flex flex-wrap items-center gap-3">
                <UButton icon="i-lucide-folder-input" :loading="state[file.name]?.busy" :disabled="!choice[file.name] || anyBusy" @click="importOne(file)">
                  {{ chosen(file)?.hasCopy ? 'Replace and import' : 'Import' }}
                </UButton>
              </div>
            </template>
          </li>
        </ul>

        <UCheckbox v-if="scan?.files.length && targets.youtube" v-model="postToYouTube" label="Also post these to the church’s YouTube channel (unlisted)" />
      </div>
      <AdminSermonSlideover
        v-model:open="making"
        :sermon="null"
        :series="series"
        :speakers="pastSpeakers"
        :speaker-choices="speakerChoices"
        :prefill="prefill"
        @saved="onMade"
        @series-created="series.push($event)"
      />
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="loading" @click="load">Scan again</UButton>
      <UButton color="neutral" variant="outline" @click="open = false">Close</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { detailsFromFileName } from '#shared/hosted-video'
import type { AdminSermonView, SeriesView, SpeakerChoice } from '#shared/sermons'
import { formatDuration, VIDEO_EXTENSIONS, type DateSource, type Suggestion, type TeachingChoice } from '#shared/video-import'

// Matching videos copied onto the church server to teachings, one at a time and confirmed by a
// person. The server reads each file for a date and suggests teachings (server/lib/video-import.ts).
interface ImportFile { name: string, size: number, modifiedAt: string, meta: { durationSeconds: number | null, location: { latitude: number, longitude: number } | null }, date: { date: string, source: DateSource }, suggestions: Suggestion[] }
interface Scan { directory: string, files: ImportFile[], teachings: TeachingChoice[] }

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()
const { targets } = useVideoTargets()
const auth = useAuthStore()
const canCreate = computed(() => auth.can({ sermon: ['create'] }))

const scan = ref<Scan | null>(null)
const loading = ref(false)
const error = ref('')
const choice = reactive<Record<string, string | undefined>>({})
const state = reactive<Record<string, { busy?: boolean, done?: boolean, error?: string } | undefined>>({})
const postToYouTube = ref(false)
const anyBusy = computed(() => Object.values(state).some(entry => entry?.busy))

const sourceLabel: Record<DateSource, string> = { 'file-name': 'from the name', 'video': 'from the video', 'file-date': 'file date, check it' }
const sourceHelp: Record<DateSource, string> = {
  'file-name': 'The file name starts with this date.',
  'video': 'The video itself says it was made on this day.',
  'file-date': 'Only the date the file was last changed. Copying or exporting resets it, so it may not be the day it was preached.',
}

const formatSize = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`

// Suggested teachings first, then the rest, newest first, so any teaching can still be picked.
const itemsFor = (file: ImportFile) => {
  const suggested = new Set(file.suggestions.map(item => item.id))
  const label = (item: TeachingChoice) => `${item.preachedOn} · ${item.title}${item.hasCopy ? ' (has a copy)' : ''}`
  return [
    ...file.suggestions.map(item => ({ value: item.id, label: `${label(item)}${item.titleMatch >= 0.5 ? ' · name matches' : item.daysApart === 0 ? ' · same day' : ` · ${item.daysApart} days apart`}`, hasCopy: item.hasCopy })),
    ...(scan.value?.teachings ?? []).filter(item => !suggested.has(item.id)).map(item => ({ value: item.id, label: label(item), hasCopy: item.hasCopy })),
  ]
}
const chosen = (file: ImportFile) => itemsFor(file).find(item => item.value === choice[file.name])

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const result = await $fetch<Scan>('/api/admin/local-video/import')
    scan.value = result
    for (const file of result.files) {
      // Pre-select a match only when it is a clear one: the name matches, or it is the one same-day teaching.
      const best = file.suggestions[0]
      const clear = best && !best.hasCopy && (best.titleMatch >= 0.5 || (best.daysApart === 0 && file.suggestions.filter(item => item.daysApart === 0).length === 1))
      if (choice[file.name] === undefined && clear) choice[file.name] = best.id
    }
  }
  catch (failure) {
    error.value = apiErrorMessage(failure, 'The import folder could not be read.')
  }
  finally {
    loading.value = false
  }
}

// Adding a teaching for a video that has none: the same form as on the Teaching page, started with
// the title and date the file name gives. Once saved the folder is read again and it is chosen.
const making = ref(false)
const makingFor = ref<ImportFile | null>(null)
const series = ref<SeriesView[]>([])
const speakerChoices = ref<SpeakerChoice[]>([])
const pastSpeakers = computed(() => [...new Set((scan.value?.teachings ?? []).map(item => item.speaker))])
const prefill = computed(() => makingFor.value
  ? { title: detailsFromFileName(makingFor.value.name).title, preachedOn: makingFor.value.date.date }
  : null)

const startTeaching = async (file: ImportFile) => {
  error.value = ''
  try {
    const [seriesList, speakerList] = await Promise.all([
      $fetch<{ series: SeriesView[] }>('/api/admin/sermon-series'),
      $fetch<{ speakers: SpeakerChoice[] }>('/api/admin/sermons/speakers'),
    ])
    series.value = seriesList.series
    speakerChoices.value = speakerList.speakers
    makingFor.value = file
    making.value = true
  }
  catch (failure) {
    error.value = apiErrorMessage(failure, 'The teaching form could not be opened.')
  }
}

const onMade = async (sermon: AdminSermonView) => {
  const file = makingFor.value
  await load()
  if (file && !state[file.name]?.done) choice[file.name] = sermon.id
}

const importOne = async (file: ImportFile) => {
  const sermonId = choice[file.name]
  if (!sermonId) return
  state[file.name] = { busy: true }
  try {
    await $fetch<{ sermonId: string }>('/api/admin/local-video/import', { method: 'POST', body: { fileName: file.name, sermonId, replace: Boolean(chosen(file)?.hasCopy), youtube: postToYouTube.value && targets.value.youtube } })
    state[file.name] = { done: true }
    emit('imported')
  }
  catch (failure) {
    state[file.name] = { error: apiErrorMessage(failure, 'That video could not be filed.') }
  }
}

watch(open, (isOpen) => {
  if (isOpen) void load()
})
</script>
