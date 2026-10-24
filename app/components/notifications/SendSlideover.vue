<template>
  <USlideover v-model:open="open" title="Send a message" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Keep it short and plain"
        description="A message can appear on someone’s lock screen, even after they have signed out of the app. Leave out private details, the names of children, and anything about missionaries."
        class="mb-5"
      />

      <UForm id="send-message-form" :schema="sendInputSchema" :state="state" class="space-y-5" @submit="send">
        <UFormField v-if="channels.length > 1" label="Send to" name="channelId">
          <USelect v-model="state.channelId" :items="channelItems" class="w-full" />
        </UFormField>
        <p v-else-if="channels[0]" class="text-sm text-toned">To everyone following <span class="font-bold">{{ channels[0].name }}</span>.</p>

        <UFormField label="Title" name="title" required :hint="`${state.title.length}/${TITLE_MAX}`">
          <UInput v-model="state.title" class="w-full" :maxlength="TITLE_MAX" placeholder="e.g. Setup starts at 8 on Sunday" />
        </UFormField>

        <UFormField label="Message" name="body" required :hint="`${state.body.length}/${BODY_MAX}`">
          <UTextarea v-model="state.body" class="w-full" :rows="4" :maxlength="BODY_MAX" />
        </UFormField>

        <UFormField label="When it is tapped, open" name="url" hint="A page on this site">
          <USelect v-model="state.url" :items="pageItems" class="w-full" />
        </UFormField>

        <p v-if="left !== null" class="text-xs" :class="left > 0 ? 'text-muted' : 'text-error'">
          {{ left > 0 ? `${left} of ${limit} left today on this channel.` : 'This channel has reached today’s limit. Try again tomorrow.' }}
        </p>
        <p v-if="minGapSeconds > 0" class="text-xs text-muted">Messages on a channel are kept {{ minGapSeconds }} seconds apart, so they arrive in the order sent.</p>
      </UForm>
    </template>

    <template #footer>
      <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
      <UButton type="submit" form="send-message-form" icon="i-lucide-send" :loading="sending" :disabled="left === 0">Send</UButton>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { BODY_MAX, TITLE_MAX, sendInputSchema, type ChannelView } from '#shared/notifications'

const props = defineProps<{
  channels: ChannelView[]
  limit: number
  minGapSeconds: number
  usedToday: Record<string, number>
}>()
const emit = defineEmits<{ sent: [] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const state = reactive({ channelId: '', title: '', body: '', url: '' })

// A short list of pages rather than a box to type an address in: a mistake cannot
// send someone to a page that does not exist, or off the site.
const pageItems = [
  { label: 'The usual page (the ministry’s, or your notifications)', value: '' },
  { label: 'Church calendar', value: '/calendar' },
  { label: 'Teaching', value: '/teaching' },
  { label: 'My lists and tasks', value: '/my-lists' },
  { label: 'Missions', value: '/missions' },
  { label: 'Directory', value: '/directory' },
]

const channelItems = computed(() => props.channels.map(channel => ({ label: channel.name, value: channel.id })))
const left = computed(() => state.channelId ? Math.max(0, props.limit - (props.usedToday[state.channelId] ?? 0)) : null)

watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(state, { channelId: props.channels[0]?.id ?? '', title: '', body: '', url: '' })
}, { immediate: true })

const sending = ref(false)
const send = async () => {
  sending.value = true
  try {
    const result = await $fetch<{ recipients: number }>(`/api/ministry-channels/${state.channelId}/send`, {
      method: 'POST',
      body: { title: state.title, body: state.body, url: state.url },
    })
    toast.add({
      title: 'Sent',
      description: result.recipients === 1 ? 'It reached 1 person.' : `It reached ${result.recipients} people.`,
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
    emit('sent')
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not sent', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    sending.value = false
  }
}
</script>
