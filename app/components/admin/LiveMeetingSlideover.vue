<template>
  <USlideover v-model:open="open" :title="meeting ? 'Edit live meeting' : 'Schedule a live meeting'" :ui="{ content: 'max-w-xl', footer: 'justify-between' }">
    <template #body>
      <UForm id="live-meeting-form" :schema="liveMeetingSchema" :state="state" class="space-y-8" @submit="save">
        <section class="space-y-4">
          <UFormField label="Name" name="title" required description="Shown on the Teaching page, e.g. Sunday worship.">
            <UInput v-model="state.title" class="w-full" />
          </UFormField>
          <UFormField label="Where" name="kind">
            <URadioGroup v-model="state.kind" :items="kindItems" />
          </UFormField>
          <UFormField label="Link" name="link" required :description="linkDescription">
            <UInput v-model="state.link" :placeholder="state.kind === 'meet' ? 'https://meet.google.com/...' : 'https://youtube.com/...'" class="w-full" />
          </UFormField>
          <UFormField label="Who can join" name="visibility">
            <URadioGroup v-model="state.visibility" :items="visibilityItems" />
          </UFormField>
        </section>

        <section class="space-y-4">
          <UFormField label="Repeats" name="repeat">
            <URadioGroup v-model="state.repeat" orientation="horizontal" :items="repeatItems" />
          </UFormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField :label="state.repeat === 'weekly' ? 'First date' : 'Date'" name="startsOn" required :help="state.repeat === 'weekly' && state.startsOn ? `Every ${weekday}` : undefined">
              <UInput v-model="state.startsOn" type="date" class="w-full" />
            </UFormField>
            <UFormField v-if="state.repeat === 'weekly'" label="Last date" name="endsOn" hint="Optional">
              <UInput v-model="endsOn" type="date" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Starts" name="startTime" required>
              <UInput v-model="state.startTime" type="time" class="w-full" />
            </UFormField>
            <UFormField label="Ends" name="endTime" required>
              <UInput v-model="state.endTime" type="time" class="w-full" />
            </UFormField>
          </div>
          <p class="text-muted text-xs">Times are church time ({{ timeZone }}). The Join button appears {{ LIVE_OPENS_EARLY_MINUTES }} minutes before it starts and goes away when it ends.</p>

          <UFormField v-if="state.repeat === 'weekly' && upcoming.length" label="Coming up" name="skippedDates" description="Untick a date it won’t be live.">
            <UCheckboxGroup v-model="liveDates" :items="upcoming.map(date => ({ value: date, label: formatLiveDate(date) }))" class="mt-1" />
          </UFormField>
        </section>
      </UForm>
    </template>

    <template #footer>
      <div>
        <UButton v-if="meeting" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmingDelete = true">Remove</UButton>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton type="submit" form="live-meeting-form" :loading="saving">{{ meeting ? 'Save' : 'Schedule' }}</UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="confirmingDelete" title="Remove this live meeting?" :description="meeting ? `${meeting.title} will no longer appear on the site, including any dates still to come.` : ''">
    <template #footer>
      <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep</UButton>
      <UButton color="error" :loading="deleting" @click="remove">Remove</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { LIVE_OPENS_EARLY_MINUTES, liveMeetingSchema, scheduleDates, type AdminLiveMeetingView, type LiveKind, type LiveMeetingInput } from '#shared/live'

const props = defineProps<{ meeting: AdminLiveMeetingView | null, timeZone: string }>()
const emit = defineEmits<{ saved: [meeting: AdminLiveMeetingView], removed: [id: string] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const kindItems = [
  { value: 'meet', label: 'Google Meet', description: 'Opens in a new tab.' },
  { value: 'youtube', label: 'YouTube Live', description: 'Plays on the Teaching page.' },
]
const visibilityItems = [
  { value: 'members', label: 'Members only', description: 'Signed-in members. The link is never shown to anyone else.' },
  { value: 'public', label: 'Everyone', description: 'Anyone visiting the site.' },
]
const repeatItems = [
  { value: 'once', label: 'Once' },
  { value: 'weekly', label: 'Weekly' },
]

const blank = (): LiveMeetingInput => ({
  title: '',
  kind: 'meet' as LiveKind,
  link: '',
  visibility: 'members',
  repeat: 'once',
  startsOn: churchToday(props.timeZone),
  endsOn: null,
  startTime: '',
  endTime: '',
  skippedDates: [],
})

const state = reactive<LiveMeetingInput>(blank())

watch(open, (isOpen) => {
  if (!isOpen) return
  const m = props.meeting
  Object.assign(state, m
    ? { title: m.title, kind: m.kind, link: m.link, visibility: m.visibility, repeat: m.repeat, startsOn: m.startsOn, endsOn: m.endsOn, startTime: m.startTime, endTime: m.endTime, skippedDates: [...m.skippedDates] }
    : blank())
}, { immediate: true })

const linkDescription = computed(() => state.kind === 'meet'
  ? 'The meeting link from Google Meet.'
  : 'A live video link, or your channel link (youtube.com/channel/UC…), which plays whatever is live on the channel, so the same link works every week.')

// An empty date input means no last date.
const endsOn = computed({
  get: () => state.endsOn ?? '',
  set: (value: string) => { state.endsOn = value || null },
})

const weekday = computed(() => {
  const [year, month, day] = state.startsOn.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
})

// The next eight dates, ticked unless skipped. Unticking one adds it to the
// skipped dates; skipped dates further out are kept.
const upcoming = computed(() => state.repeat === 'weekly' && state.startsOn
  ? scheduleDates(state, churchToday(props.timeZone), 8)
  : [])
const liveDates = computed({
  get: () => upcoming.value.filter(date => !state.skippedDates.includes(date)),
  set: (chosen: string[]) => {
    const shown = new Set(upcoming.value)
    state.skippedDates = [
      ...state.skippedDates.filter(date => !shown.has(date)),
      ...upcoming.value.filter(date => !chosen.includes(date)),
    ].sort()
  },
})

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const { meeting } = props.meeting
      ? await $fetch<{ meeting: AdminLiveMeetingView }>(`/api/admin/live-meetings/${props.meeting.id}`, { method: 'PUT', body: { ...state } })
      : await $fetch<{ meeting: AdminLiveMeetingView }>('/api/admin/live-meetings', { method: 'POST', body: { ...state } })
    emit('saved', meeting)
    toast.add({ title: props.meeting ? 'Changes saved' : `${meeting.title} scheduled`, color: 'success', icon: 'i-lucide-circle-check' })
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
  if (!props.meeting) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/live-meetings/${props.meeting.id}`, { method: 'DELETE' })
    emit('removed', props.meeting.id)
    toast.add({ title: 'Live meeting removed', color: 'success' })
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
