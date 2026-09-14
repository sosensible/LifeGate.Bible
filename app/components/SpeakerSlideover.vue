<template>
  <USlideover v-model:open="open" :title="speaker ? `Edit ${fullName(speaker)}` : 'Add a speaker'" :ui="{ content: 'max-w-xl', footer: 'justify-between' }">
    <template #body>
      <div class="space-y-6">
        <UFormField v-if="!speaker" label="Who is speaking">
          <URadioGroup v-model="source" orientation="horizontal" :items="[{ value: 'guest', label: 'A guest speaker' }, { value: 'member', label: 'A church member' }]" />
        </UFormField>

        <!-- A member: their details stay theirs, kept on their profile. -->
        <template v-if="!speaker && source === 'member'">
          <UFormField label="Member" required>
            <USelectMenu v-model="personId" :items="memberItems" value-key="value" placeholder="Choose a member" class="w-full" />
          </UFormField>
          <p class="text-muted text-xs">Members choose what contact details the directory shows from their own profile.</p>
        </template>

        <UForm v-else id="speaker-form" :schema="guestSpeakerSchema" :state="state" class="space-y-6" @submit="save">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="First name" name="firstName" required>
              <UInput v-model="state.firstName" class="w-full" />
            </UFormField>
            <UFormField label="Last name" name="lastName" required>
              <UInput v-model="state.lastName" class="w-full" />
            </UFormField>
            <UFormField label="Title" name="title" hint="e.g. Pastor" class="sm:col-span-2">
              <UInput v-model="state.title" class="w-full" />
            </UFormField>
            <UFormField label="Phone" name="phone">
              <UInput v-model="state.phone" type="tel" class="w-full" />
            </UFormField>
            <UFormField label="Email" name="email">
              <UInput v-model="state.email" type="email" class="w-full" />
            </UFormField>
          </div>
          <section class="space-y-3">
            <h3 class="font-serif text-lg font-bold text-highlighted">Shown to members</h3>
            <p class="text-muted text-xs">Only what the speaker has agreed to share.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <USwitch v-model="state.sharePhone" label="Phone" />
              <USwitch v-model="state.shareEmail" label="Email" />
            </div>
          </section>
        </UForm>
      </div>
    </template>

    <template #footer>
      <UButton v-if="speaker" color="neutral" variant="ghost" icon="i-lucide-archive" @click="confirmingArchive = true">Archive</UButton>
      <span v-else />
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton v-if="!speaker && source === 'member'" :loading="saving" :disabled="!personId" @click="save">Add speaker</UButton>
        <UButton v-else type="submit" form="speaker-form" :loading="saving">{{ speaker ? 'Save' : 'Add speaker' }}</UButton>
      </div>
    </template>
  </USlideover>

  <SpeakerArchiveModal v-model:open="confirmingArchive" :speaker="speaker" @archived="onArchived" />
</template>

<script setup lang="ts">
import { guestSpeakerSchema, type SpeakerView } from '#shared/speakers'

// Editing is for guest speakers; a member speaker is only added or archived here.
const props = defineProps<{
  speaker: SpeakerView | null
  candidates: Array<{ id: string, firstName: string, lastName: string }>
}>()
const emit = defineEmits<{ saved: [], archived: [] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const source = ref<'guest' | 'member'>('guest')
const personId = ref<string | undefined>()
const blank = () => ({ firstName: '', lastName: '', title: '', phone: '', email: '', sharePhone: false, shareEmail: false })
const state = reactive(blank())

const memberItems = computed(() => props.candidates.map(c => ({ value: c.id, label: `${c.lastName}, ${c.firstName}` })))

watch(open, (isOpen) => {
  if (!isOpen) return
  const s = props.speaker
  source.value = 'guest'
  personId.value = undefined
  Object.assign(state, s
    ? { firstName: s.firstName, lastName: s.lastName, title: s.title ?? '', phone: s.phone ?? '', email: s.email ?? '', sharePhone: s.sharePhone, shareEmail: s.shareEmail }
    : blank())
}, { immediate: true })

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const { speaker } = props.speaker
      ? await $fetch(`/api/speakers/${props.speaker.id}`, { method: 'PUT', body: state })
      : await $fetch('/api/speakers', { method: 'POST', body: source.value === 'member' ? { source: 'member', personId: personId.value } : { source: 'guest', ...state } })
    toast.add({ title: props.speaker ? 'Changes saved' : `${fullName(speaker)} added as a speaker`, color: 'success', icon: 'i-lucide-circle-check' })
    emit('saved')
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = false
  }
}

const confirmingArchive = ref(false)
const onArchived = () => {
  emit('archived')
  open.value = false
}
</script>
