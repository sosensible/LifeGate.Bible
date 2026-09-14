<template>
  <USlideover v-model:open="open" :title="organization ? `Edit ${organization.name}` : 'Add a mission organization'" :ui="{ content: 'max-w-xl', footer: 'justify-between' }">
    <template #body>
      <UForm id="organization-form" :schema="organizationSchema" :state="state" class="space-y-6" @submit="save">
        <UFormField label="Name" name="name" required>
          <UInput v-model="state.name" placeholder="e.g. Baptist Mid-Missions" class="w-full" />
        </UFormField>
        <UFormField label="Photo or logo" name="photo">
          <MissionsPhotoField v-model:photo="state.photo" v-model:preview-url="previewUrl" />
        </UFormField>
        <UFormField label="Our relationship" name="relationship" hint="e.g. Sending agency">
          <UInput v-model="state.relationship" class="w-full" />
        </UFormField>
        <UFormField label="Website" name="website">
          <UInput v-model="state.website" type="url" placeholder="https://" class="w-full" />
        </UFormField>
        <UFormField label="About" name="writeup">
          <UTextarea v-model="state.writeup" :rows="8" autoresize class="w-full" />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <UButton v-if="organization" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmingDelete = true">Remove</UButton>
      <span v-else />
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton type="submit" form="organization-form" :loading="saving">{{ organization ? 'Save' : 'Add organization' }}</UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="confirmingDelete" title="Remove this organization?" :description="organization ? `${organization.name} will be removed. Missionaries who serve with it are kept, with no organization.` : ''">
    <template #footer>
      <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep</UButton>
      <UButton color="error" :loading="deleting" @click="remove">Remove</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { organizationSchema, type OrganizationView } from '#shared/missions'

const props = defineProps<{ organization: OrganizationView | null }>()
const emit = defineEmits<{ saved: [organization: OrganizationView], removed: [id: string] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const blank = () => ({ name: '', photo: null as string | null, relationship: '', website: '', writeup: '' })
const state = reactive(blank())
const previewUrl = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  const o = props.organization
  Object.assign(state, o
    ? { name: o.name, photo: o.photo, relationship: o.relationship ?? '', website: o.website ?? '', writeup: o.writeup ?? '' }
    : blank())
  previewUrl.value = o?.photoUrl ?? null
}, { immediate: true })

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const { organization } = props.organization
      ? await $fetch(`/api/missions/organizations/${props.organization.id}`, { method: 'PUT', body: state })
      : await $fetch('/api/missions/organizations', { method: 'POST', body: state })
    emit('saved', organization!)
    toast.add({ title: props.organization ? 'Changes saved' : `${organization!.name} added`, color: 'success', icon: 'i-lucide-circle-check' })
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
  if (!props.organization) return
  deleting.value = true
  try {
    await $fetch(`/api/missions/organizations/${props.organization.id}`, { method: 'DELETE' })
    emit('removed', props.organization.id)
    toast.add({ title: `${props.organization.name} removed`, color: 'success' })
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
