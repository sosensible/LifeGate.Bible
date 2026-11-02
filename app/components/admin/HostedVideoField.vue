<template>
  <section v-if="enabled" class="space-y-3">
    <UFormField
      label="Church video"
      hint="Optional"
      description="Choose the video here and it uploads in the background, so you can save and leave. It plays instead of YouTube once it is ready, and only people who may watch this message can start it."
    >
      <!-- Uploading now -->
      <div v-if="active" class="space-y-2">
        <UProgress :model-value="active.phase === 'starting' ? null : active.percent" />
        <p class="text-muted text-sm">
          <template v-if="active.phase === 'failed'">{{ active.error }}</template>
          <template v-else>{{ active.phase === 'starting' ? 'Getting ready to upload…' : `Uploading ${active.percent}%.` }} You can close this form; keep the site open until it finishes. It resumes if the connection drops.</template>
        </p>
        <UButton size="xs" color="neutral" variant="outline" @click="uploads.cancel(sermon!.id)">Cancel upload</UButton>
      </div>

      <!-- A copy is on the host -->
      <div v-else-if="sermon?.hosted && !replacing" class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UBadge variant="subtle" :color="STATE_COLORS[sermon.hosted.state]" :icon="STATE_ICONS[sermon.hosted.state]">{{ HOSTED_VIDEO_LABELS[sermon.hosted.state] }}</UBadge>
          <div class="flex gap-2">
            <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="checking" @click="check">Check</UButton>
            <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-upload" @click="replacing = true">Replace</UButton>
            <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmingRemove = true">Remove</UButton>
          </div>
        </div>
        <p v-if="sermon.hosted.state === 'failed'" class="text-sm text-error">The video host could not process that file. Replace it with another.</p>
      </div>

      <!-- Choose a file: while adding a message it waits until the message is saved -->
      <div v-else class="space-y-2">
        <UFileUpload
          v-model="file"
          accept="video/*"
          :label="file ? file.name : 'Choose or drop a video file'"
          description="MP4 or MOV. Large files are fine."
          icon="i-lucide-video"
          class="w-full min-h-32"
          @update:model-value="chosen"
        />
        <UButton v-if="replacing" size="xs" color="neutral" variant="ghost" @click="replacing = false; file = null">Keep the current video</UButton>
      </div>
    </UFormField>

    <USwitch
      v-if="canPublish && (!sermon || sermon.status === 'draft') && (file || sermon?.hosted?.state === 'processing' || sermon?.publishWhenReady)"
      :model-value="publishWhenReady"
      :disabled="settingPublish"
      label="Publish as soon as the video is ready"
      description="The message goes live by itself when the video host finishes preparing it, even if nobody has this page open."
      @update:model-value="setPublishWhenReady"
    />

    <UModal v-model:open="confirmingRemove" title="Remove the church video?" description="It is deleted from the video host. A YouTube link on this message is not touched.">
      <template #footer>
        <UButton color="neutral" variant="outline" @click="confirmingRemove = false">Keep</UButton>
        <UButton color="error" :loading="removing" @click="remove">Remove</UButton>
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import { HOSTED_VIDEO_LABELS, type HostedVideoState } from '#shared/hosted-video'
import type { AdminSermonView } from '#shared/sermons'

// Choosing a message's own copy of its video. On an existing message the upload starts
// at once; on one being added it waits, held by the form, until the message is saved.
const props = defineProps<{ sermon: AdminSermonView | null, canPublish: boolean }>()
const emit = defineEmits<{ changed: [sermon: AdminSermonView] }>()
const file = defineModel<File | null>('file', { default: null })
const wantsPublish = defineModel<boolean>('publishWhenReady', { default: false })

const toast = useToast()
const uploads = useHostedVideoUploads()
uploads.onChanged((changed) => {
  if (changed.id === props.sermon?.id) emit('changed', changed)
})

const enabled = ref(false)
onMounted(async () => {
  try {
    enabled.value = (await $fetch<{ enabled: boolean }>('/api/admin/sermons/hosted-video')).enabled
  }
  catch {
    enabled.value = false
  }
})

const STATE_COLORS: Record<HostedVideoState, 'warning' | 'success' | 'error'> = { processing: 'warning', ready: 'success', failed: 'error' }
const STATE_ICONS: Record<HostedVideoState, string> = { processing: 'i-lucide-loader-circle', ready: 'i-lucide-circle-check', failed: 'i-lucide-circle-alert' }

const active = computed(() => (props.sermon ? uploads.progress.value[props.sermon.id] : undefined))
const replacing = ref(false)
const publishWhenReady = computed(() => props.sermon ? props.sermon.publishWhenReady : wantsPublish.value)

// On a saved message the upload starts now; on a new one it waits for the save.
const chosen = (picked: File | null | undefined) => {
  if (!picked || !props.sermon) return
  replacing.value = false
  file.value = null
  void uploads.start(props.sermon, picked, { publishWhenReady: props.canPublish && props.sermon.status === 'draft' && wantsPublish.value })
}

const settingPublish = ref(false)
const setPublishWhenReady = async (on: boolean | 'indeterminate') => {
  const value = on === true
  if (!props.sermon) {
    wantsPublish.value = value
    return
  }
  if (props.sermon.hosted === null) {
    wantsPublish.value = value
    return
  }
  settingPublish.value = true
  try {
    emit('changed', (await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${props.sermon.id}/hosted-video/publish-when-ready`, { method: 'PUT', body: { on: value } })).sermon)
  }
  catch (error) {
    toast.add({ title: 'Not changed', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    settingPublish.value = false
  }
}

const checking = ref(false)
const check = async () => {
  if (!props.sermon) return
  checking.value = true
  try {
    emit('changed', (await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${props.sermon.id}/hosted-video`)).sermon)
  }
  catch (error) {
    toast.add({ title: 'Could not check', description: apiErrorMessage(error), color: 'warning', icon: 'i-lucide-triangle-alert' })
  }
  finally {
    checking.value = false
  }
}

const confirmingRemove = ref(false)
const removing = ref(false)
const remove = async () => {
  if (!props.sermon) return
  removing.value = true
  try {
    emit('changed', (await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${props.sermon.id}/hosted-video`, { method: 'DELETE' })).sermon)
    confirmingRemove.value = false
    toast.add({ title: 'Church video removed', color: 'success' })
  }
  catch (error) {
    toast.add({ title: 'Not removed', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    removing.value = false
  }
}
</script>
