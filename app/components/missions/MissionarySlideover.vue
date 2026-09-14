<template>
  <USlideover v-model:open="open" :title="missionary ? `Edit ${missionary.name}` : 'Add a missionary'" :ui="{ content: 'max-w-2xl', footer: 'justify-between' }">
    <template #body>
      <UForm id="missionary-form" :schema="missionarySchema" :state="state" class="space-y-8" @submit="save">
        <!-- Who -->
        <section class="space-y-4">
          <UFormField name="kind">
            <URadioGroup v-model="state.kind" orientation="horizontal" :items="kindItems" />
          </UFormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Name" name="name" required :hint="state.kind === 'family' ? 'e.g. The Reyes Family' : undefined">
              <UInput v-model="state.name" class="w-full" />
            </UFormField>
            <UFormField v-if="state.kind === 'family'" label="Family members" name="familyNames" hint="e.g. Tom, Anna, Eli and Ruth">
              <UInput v-model="state.familyNames" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Photo" name="photo">
            <MissionsPhotoField v-model:photo="state.photo" v-model:preview-url="previewUrl" />
          </UFormField>
        </section>

        <!-- Ministry -->
        <section class="space-y-4">
          <h3 class="font-serif text-lg font-bold text-highlighted">Ministry</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Field" name="field" hint="Country or region">
              <UInput v-model="state.field" class="w-full" />
            </UFormField>
            <UFormField label="Focus" name="focus" hint="e.g. Church planting">
              <UInput v-model="state.focus" class="w-full" />
            </UFormField>
            <UFormField label="Organization" name="organizationId">
              <USelectMenu v-model="state.organizationId" :items="organizationItems" value-key="id" label-key="name" placeholder="None" clear class="w-full" />
            </UFormField>
            <UFormField label="Status" name="status">
              <USelect v-model="state.status" :items="statusItems" class="w-full" />
            </UFormField>
            <UFormField label="Serving since" name="startedYear" hint="Year">
              <UInputNumber v-model="startedYear" :min="1900" :max="2200" :format-options="{ useGrouping: false }" class="w-full" />
            </UFormField>
            <UFormField label="Support link" name="supportUrl" hint="Where to give">
              <UInput v-model="state.supportUrl" type="url" placeholder="https://" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="About" name="writeup">
            <UTextarea v-model="state.writeup" :rows="8" autoresize class="w-full" />
          </UFormField>
        </section>

        <!-- Next visit -->
        <section class="space-y-4">
          <h3 class="font-serif text-lg font-bold text-highlighted">Next visit to Lifegate</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Date" name="nextVisitOn">
              <UInput v-model="state.nextVisitOn" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Note" name="nextVisitNote" hint="e.g. Sunday evening service">
              <UInput v-model="state.nextVisitNote" class="w-full" />
            </UFormField>
          </div>
        </section>

        <!-- Contact -->
        <section class="space-y-4">
          <h3 class="font-serif text-lg font-bold text-highlighted">Contact</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Email" name="email">
              <UInput v-model="state.email" type="email" class="w-full" />
            </UFormField>
            <UFormField label="Phone" name="phone">
              <UInput v-model="state.phone" type="tel" class="w-full" />
            </UFormField>
            <UFormField label="Website" name="website">
              <UInput v-model="state.website" type="url" placeholder="https://" class="w-full" />
            </UFormField>
            <UFormField label="Mailing address" name="mailingAddress">
              <UTextarea v-model="state.mailingAddress" :rows="2" autoresize class="w-full" />
            </UFormField>
          </div>
          <UFormField name="shareContact">
            <USwitch
              v-model="state.shareContact"
              label="Show contact details to members"
              description="Only with the missionaries' agreement. Otherwise only people who keep Missions see them."
            />
          </UFormField>
        </section>
      </UForm>
    </template>

    <template #footer>
      <UButton v-if="missionary" color="neutral" variant="ghost" icon="i-lucide-archive" @click="confirmingDelete = true">Archive</UButton>
      <span v-else />
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton type="submit" form="missionary-form" :loading="saving">{{ missionary ? 'Save' : 'Add missionary' }}</UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="confirmingDelete" title="Archive this missionary?" :description="missionary ? `${missionary.name} will be hidden from members. Staff and administrators can restore it or remove it permanently.` : ''">
    <template #footer>
      <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep</UButton>
      <UButton :loading="deleting" icon="i-lucide-archive" @click="remove">Archive</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import {
  MISSIONARY_KIND_LABELS,
  MISSIONARY_STATUS_LABELS,
  missionarySchema,
  type MissionaryKind,
  type MissionaryStatus,
  type MissionaryView,
} from '#shared/missions'

const props = defineProps<{
  missionary: MissionaryView | null
  organizations: Array<{ id: string, name: string }>
}>()
const emit = defineEmits<{ saved: [missionary: MissionaryView], archived: [id: string] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const kindItems = (Object.keys(MISSIONARY_KIND_LABELS) as MissionaryKind[]).map(value => ({ value, label: MISSIONARY_KIND_LABELS[value] }))
const statusItems = (Object.keys(MISSIONARY_STATUS_LABELS) as MissionaryStatus[]).map(value => ({ value, label: MISSIONARY_STATUS_LABELS[value] }))

// An organization archived since it was chosen still shows, so saving does not drop it.
const organizationItems = computed(() => {
  const current = props.missionary?.organization
  return current && !props.organizations.some(o => o.id === current.id)
    ? [...props.organizations, { id: current.id, name: `${current.name} (archived)` }]
    : props.organizations
})

const blank = () => ({
  kind: 'family' as MissionaryKind,
  name: '',
  photo: null as string | null,
  writeup: '',
  familyNames: '',
  field: '',
  focus: '',
  organizationId: null as string | null,
  status: 'onField' as MissionaryStatus,
  startedYear: null as number | null,
  supportUrl: '',
  email: '',
  phone: '',
  mailingAddress: '',
  website: '',
  shareContact: false,
  nextVisitOn: '',
  nextVisitNote: '',
})
const state = reactive(blank())
const previewUrl = ref<string | null>(null)

// UInputNumber clears to undefined; the API wants null.
const startedYear = computed({
  get: () => state.startedYear ?? undefined,
  set: (value?: number | null) => { state.startedYear = value ?? null },
})

watch(open, (isOpen) => {
  if (!isOpen) return
  const m = props.missionary
  Object.assign(state, m
    ? {
        kind: m.kind, name: m.name, photo: m.photo, writeup: m.writeup ?? '', familyNames: m.familyNames ?? '',
        field: m.field ?? '', focus: m.focus ?? '', organizationId: m.organization?.id ?? null, status: m.status,
        startedYear: m.startedYear, supportUrl: m.supportUrl ?? '',
        email: m.email ?? '', phone: m.phone ?? '', mailingAddress: m.mailingAddress ?? '', website: m.website ?? '',
        shareContact: m.shareContact, nextVisitOn: m.nextVisitOn ?? '', nextVisitNote: m.nextVisitNote ?? '',
      }
    : blank())
  previewUrl.value = m?.photoUrl ?? null
}, { immediate: true })

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const body = { ...state, familyNames: state.kind === 'family' ? state.familyNames : '' }
    const { missionary } = props.missionary
      ? await $fetch(`/api/missions/missionaries/${props.missionary.id}`, { method: 'PUT', body })
      : await $fetch('/api/missions/missionaries', { method: 'POST', body })
    emit('saved', missionary!)
    toast.add({ title: props.missionary ? 'Changes saved' : `${missionary!.name} added`, color: 'success', icon: 'i-lucide-circle-check' })
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
  if (!props.missionary) return
  deleting.value = true
  try {
    await $fetch(`/api/missions/missionaries/${props.missionary.id}/archive`, { method: 'POST' })
    emit('archived', props.missionary.id)
    toast.add({ title: `${props.missionary.name} archived`, color: 'success', icon: 'i-lucide-archive' })
    confirmingDelete.value = false
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not archived', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    deleting.value = false
  }
}
</script>
