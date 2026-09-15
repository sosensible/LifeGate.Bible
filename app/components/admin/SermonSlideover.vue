<template>
  <USlideover v-model:open="open" :title="sermon ? 'Edit message' : 'Add a message'" :ui="{ content: 'max-w-2xl', footer: 'justify-between' }">
    <template #body>
      <UForm id="sermon-form" :schema="sermonSchema" :state="state" class="space-y-8" @submit="save">
        <!-- Video -->
        <section class="space-y-3">
          <UFormField label="YouTube video" name="video" hint="Unlisted is fine" description="Paste the link from YouTube's Share button. Leave empty if the video is not posted yet.">
            <div class="flex gap-2">
              <UInput v-model="state.video" placeholder="https://youtu.be/..." class="flex-1" @update:model-value="lookup = null" />
              <UButton variant="outline" color="neutral" :loading="checking" :disabled="!state.video" @click="checkVideo">Check</UButton>
            </div>
          </UFormField>
          <UAlert
            v-if="lookup"
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            :title="lookup.title ?? 'Video found'"
            :description="lookup.channel ? `On ${lookup.channel}` : undefined"
            :actions="lookup.title && lookup.title !== state.title ? [{ label: 'Use this title', color: 'neutral', variant: 'outline', size: 'xs', onClick: () => { state.title = lookup!.title! } }] : undefined"
          />
        </section>

        <!-- Message -->
        <section class="space-y-4">
          <UFormField label="Title" name="title" required>
            <UInput v-model="state.title" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Date taught" name="preachedOn" required>
              <UInput v-model="state.preachedOn" type="date" class="w-full" />
            </UFormField>
            <UFormField
              label="Speaker"
              name="speaker"
              required
              :help="state.speakerPersonId ? 'On the Speakers list. If they have an account, they can edit this message’s details.' : state.speaker ? 'A typed name, not linked to the Speakers list.' : 'Pick from the Speakers list, or type a guest’s name.'"
            >
              <USelectMenu v-model="speakerChoice" :items="speakerItems" value-key="value" create-item placeholder="Who taught" class="w-full" @create="addGuest" />
            </UFormField>
            <UFormField label="Series" name="seriesId">
              <USelectMenu
                v-model="state.seriesId"
                :items="seriesItems"
                value-key="id"
                label-key="name"
                placeholder="None"
                create-item
                clear
                class="w-full"
                @create="createSeries"
              />
            </UFormField>
            <UFormField label="Passage" name="scripture" hint="e.g. John 10:1–18">
              <UInput v-model="state.scripture" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Books of the Bible" name="books" description="Used for the Books filter on the Teaching page.">
            <USelectMenu v-model="state.books" :items="[...BIBLE_BOOKS]" multiple placeholder="Choose books" class="w-full" />
          </UFormField>
          <UFormField label="Topics" name="tags" description="Press Enter after each topic.">
            <UInputTags v-model="state.tags" placeholder="e.g. Grace" class="w-full" />
          </UFormField>
          <UFormField label="Notes" name="description">
            <UTextarea v-model="state.description" :rows="6" autoresize class="w-full" />
          </UFormField>
        </section>

        <!-- Who and when -->
        <section class="space-y-4">
          <UFormField label="Who can watch" name="visibility">
            <URadioGroup v-model="state.visibility" :items="visibilityItems" />
          </UFormField>
          <UFormField name="status">
            <USwitch
              v-model="published"
              :disabled="!canPublish"
              label="Published"
              :description="canPublish ? 'Drafts are only visible to people who manage teaching.' : 'Someone with permission to publish will make it live.'"
            />
          </UFormField>
        </section>
      </UForm>
    </template>

    <template #footer>
      <div class="flex gap-2">
        <UButton v-if="sermon && canDelete" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmingDelete = true">Remove</UButton>
        <UButton v-if="sermon" :to="`/teaching/${sermon.slug}`" target="_blank" variant="ghost" color="neutral" icon="i-lucide-external-link">View</UButton>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton type="submit" form="sermon-form" :loading="saving">{{ sermon ? 'Save' : 'Add message' }}</UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="confirmingDelete" title="Remove this message?" :description="sermon ? `“${sermon.title}” will be removed from the site. The video stays on YouTube.` : ''">
    <template #footer>
      <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep</UButton>
      <UButton color="error" :loading="deleting" @click="remove">Remove</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { BIBLE_BOOKS, type BibleBook } from '#shared/bible'
import { sermonSchema, type AdminSermonView, type SeriesView, type SpeakerChoice } from '#shared/sermons'
import { youTubeWatchUrl } from '#shared/youtube'

const props = defineProps<{
  sermon: AdminSermonView | null
  series: SeriesView[]
  // Names used on past messages, most recent first.
  speakers: string[]
  // The Speakers list; picking one links the message to that person.
  speakerChoices: SpeakerChoice[]
}>()

const emit = defineEmits<{
  saved: [sermon: AdminSermonView]
  removed: [id: string]
  seriesCreated: [series: SeriesView]
}>()

const open = defineModel<boolean>('open', { required: true })

const auth = useAuthStore()
const toast = useToast()
const canPublish = computed(() => auth.can({ sermon: ['publish'] }))
const canDelete = computed(() => auth.can({ sermon: ['delete'] }))

const visibilityItems = [
  { value: 'members', label: 'Members only', description: 'Signed-in members. The video link is never shown to anyone else.' },
  { value: 'public', label: 'Everyone', description: 'Listed on the public Teaching page.' },
]

const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local time

const blank = () => ({
  title: '',
  preachedOn: today(),
  // The most recent speaker, linked if they are on the Speakers list.
  speaker: props.speakers[0] ?? '',
  speakerPersonId: props.speakerChoices.find(c => c.name === props.speakers[0])?.id ?? null,
  seriesId: null as string | null,
  scripture: '',
  books: [] as BibleBook[],
  tags: [] as string[],
  description: '',
  video: '',
  visibility: 'members' as 'members' | 'public',
  status: 'draft' as 'draft' | 'published',
})

const state = reactive(blank())
const published = computed({
  get: () => state.status === 'published',
  set: (value: boolean) => { state.status = value ? 'published' : 'draft' },
})

const load = () => {
  const s = props.sermon
  lookup.value = null
  Object.assign(state, s
    ? {
        title: s.title, preachedOn: s.preachedOn, speaker: s.speaker, speakerPersonId: s.speakerPersonId, seriesId: s.series?.id ?? null,
        scripture: s.scripture ?? '', books: [...s.books] as BibleBook[], tags: [...s.tags], description: s.description ?? '',
        video: s.videoId ? youTubeWatchUrl(s.videoId) : '', visibility: s.visibility, status: s.status,
      }
    : blank())
}

// Speakers: the list's people by id, and typed guest names as `guest:Name`.
const guestNames = ref<string[]>([])
const speakerItems = computed(() => {
  const listed = new Set(props.speakerChoices.map(c => c.name))
  const guests = [...new Set([...props.speakers, ...guestNames.value, ...(state.speaker && !state.speakerPersonId ? [state.speaker] : [])])]
    .filter(name => name && !listed.has(name))
  return [
    props.speakerChoices.map(c => ({ value: c.id, label: c.name, icon: 'i-lucide-user-round-check' })),
    guests.map(name => ({ value: `guest:${name}`, label: name, icon: 'i-lucide-user-round' })),
  ].filter(group => group.length)
})
const speakerChoice = computed({
  get: () => state.speakerPersonId ?? (state.speaker ? `guest:${state.speaker}` : undefined),
  set: (value: string | undefined) => {
    if (!value) return
    if (value.startsWith('guest:')) {
      state.speakerPersonId = null
      state.speaker = value.slice('guest:'.length)
      return
    }
    state.speakerPersonId = value
    state.speaker = props.speakerChoices.find(c => c.id === value)?.name ?? state.speaker
  },
})
const addGuest = (name: string) => {
  guestNames.value.push(name)
  speakerChoice.value = `guest:${name}`
}

const lookup = ref<{ title: string | null, channel: string | null } | null>(null)
const seriesItems = computed(() => props.series.map(({ id, name }) => ({ id, name })))
watch(open, (isOpen) => {
  if (isOpen) load()
}, { immediate: true })

const checking = ref(false)
const checkVideo = async () => {
  checking.value = true
  try {
    const result = await $fetch('/api/admin/sermons/lookup', { method: 'POST', body: { video: state.video } })
    lookup.value = result
    if (!state.title && result.title) state.title = result.title
  }
  catch (error) {
    lookup.value = null
    toast.add({ title: 'Video not confirmed', description: apiErrorMessage(error), color: 'warning', icon: 'i-lucide-triangle-alert' })
  }
  finally {
    checking.value = false
  }
}

const createSeries = async (name: string) => {
  try {
    const { series } = await $fetch('/api/admin/sermon-series', { method: 'POST', body: { name } })
    emit('seriesCreated', series)
    state.seriesId = series.id
  }
  catch (error) {
    toast.add({ title: 'Series not created', description: apiErrorMessage(error), color: 'error' })
  }
}

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const body: Record<string, unknown> = { ...state }
    // Without permission to publish, leave the status as it is.
    if (!canPublish.value) delete body.status
    const sermon: AdminSermonView = props.sermon
      ? (await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${props.sermon.id}`, { method: 'PATCH', body })).sermon
      : (await $fetch('/api/admin/sermons', { method: 'POST', body: { ...body, status: canPublish.value ? state.status : 'draft' } })).sermon
    emit('saved', sermon)
    toast.add({ title: props.sermon ? 'Changes saved' : `“${sermon.title}” added`, color: 'success', icon: 'i-lucide-circle-check' })
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = false
  }
}

const confirmingDelete = ref(false)
const deleting = ref(false)
const remove = async () => {
  if (!props.sermon) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/sermons/${props.sermon.id}`, { method: 'DELETE' })
    emit('removed', props.sermon.id)
    toast.add({ title: 'Message removed', color: 'success' })
    confirmingDelete.value = false
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not removed', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    deleting.value = false
  }
}
</script>
