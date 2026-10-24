<template>
  <USlideover v-model:open="open" :title="channel ? 'Edit channel' : 'New channel'" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <UForm id="channel-form" :schema="channelInputSchema" :state="state" class="space-y-5" @submit="save">
        <UFormField label="Name" name="name" required>
          <UInput v-model="state.name" class="w-full" maxlength="40" placeholder="e.g. Schedule changes" />
        </UFormField>
        <UFormField label="What it is for" name="description" hint="Shown to people choosing what to follow">
          <UInput v-model="state.description" class="w-full" maxlength="120" />
        </UFormField>
        <USwitch
          v-if="channel"
          v-model="state.retired"
          label="Retire this channel"
          description="Nothing more can be sent to it, and it leaves people’s lists of what to follow. What was already sent stays."
        />
      </UForm>
    </template>

    <template #footer>
      <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
      <UButton type="submit" form="channel-form" :loading="saving">{{ channel ? 'Save' : 'Add channel' }}</UButton>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { channelInputSchema, type ChannelView } from '#shared/notifications'

// `createUrl` and `patchBase` say whether this is a ministry's channel or a
// church-wide one: the rules differ, the form does not.
const props = defineProps<{ channel: ChannelView | null, createUrl: string, patchBase: string }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const state = reactive({ name: '', description: '', retired: false })

watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(state, props.channel
    ? { name: props.channel.name, description: props.channel.description, retired: props.channel.archived }
    : { name: '', description: '', retired: false })
}, { immediate: true })

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    if (props.channel) {
      await $fetch(`${props.patchBase}/${props.channel.id}`, { method: 'PATCH', body: { name: state.name, description: state.description, archived: state.retired } })
    }
    else {
      await $fetch(props.createUrl, { method: 'POST', body: { name: state.name, description: state.description } })
    }
    toast.add({ title: props.channel ? 'Changes saved' : 'Channel added', color: 'success', icon: 'i-lucide-circle-check' })
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
</script>
