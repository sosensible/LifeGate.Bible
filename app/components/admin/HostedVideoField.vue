<template>
  <!-- Until a video host is connected, say so, so the option is not simply missing. -->
  <section v-if="targets.loaded && !targets.host && !targets.youtube && !targets.local" class="space-y-2">
    <UFormField label="Church video" hint="Not connected yet" description="Upload a video here and it goes to the church's own video host and its YouTube channel, instead of being posted by hand.">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-plug-zap"
        title="No video host or YouTube channel is connected to this site yet"
        description="An administrator connects them under Church details, and the setup guides in Help explain each step. Until then, post the video to YouTube yourself and paste its link above."
      />
    </UFormField>
  </section>

  <section v-else-if="targets.host || targets.youtube || targets.local" class="space-y-3">
    <UFormField
      label="Church video"
      hint="Optional"
      description="Choose the video here and it uploads in the background, so you can save and leave. It plays instead of YouTube once it is ready, and only people who may watch this message can start it."
    >
      <!-- The church server keeps a copy -->
      <div v-if="sermon?.localCopy && !active" class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default px-3 py-2">
        <p class="text-sm"><UIcon name="i-lucide-hard-drive" class="w-4 h-4 mr-1.5 align-text-bottom text-primary" />Stored on the church server · {{ formatBytes(sermon.localCopy.size) }} · {{ new Date(sermon.localCopy.storedAt).toLocaleDateString() }}</p>
        <div class="flex flex-wrap gap-1">
          <UButton v-if="canDelete && targets.host && sermon.hosted?.state === 'ready'" size="xs" color="neutral" variant="outline" icon="i-lucide-cloud" :loading="releasing" @click="releaseLocal">Keep only on the video host</UButton>
          <UButton v-if="canDelete" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" :loading="removingLocal" @click="confirmingRemoveLocal = true">Remove local copy</UButton>
        </div>
      </div>

      <!-- Being sent on from the church server, to the video host and to YouTube -->
      <template v-if="sermon && !active">
        <div v-for="place in places" :key="place.target" class="mb-3">
          <div v-if="place.push && place.push.state !== 'sent'" class="rounded-lg border border-default px-3 py-2 text-sm space-y-1">
            <p v-if="place.push.state !== 'failed'">
              <UIcon name="i-lucide-loader-circle" class="w-4 h-4 mr-1.5 align-text-bottom animate-spin" />
              {{ place.push.state === 'sending' ? `Sending to ${place.name} from the church server…` : `Waiting to be sent to ${place.name}…` }}
            </p>
            <template v-else>
              <p class="text-error"><UIcon name="i-lucide-circle-alert" class="w-4 h-4 mr-1.5 align-text-bottom" />Could not send to {{ place.name }}{{ place.push.willRetry ? '; the site will try again by itself' : '' }}.</p>
              <p v-if="place.push.error" class="text-muted text-xs">{{ place.push.error }}</p>
            </template>
            <UButton v-if="place.push.state === 'failed'" size="xs" color="neutral" variant="outline" icon="i-lucide-send" :loading="sending === place.target" @click="sendTo(place.target)">Send now</UButton>
          </div>
          <UButton v-else-if="sermon.localCopy && place.connected && !place.push && !place.has" size="xs" color="neutral" variant="outline" icon="i-lucide-send" :loading="sending === place.target" @click="sendTo(place.target)">Send the stored copy to {{ place.name }}</UButton>
        </div>
      </template>

      <!-- Bringing the original in from the video host, when the file is stored only there -->
      <div v-if="sermon && !active && !sermon.localCopy && targets.local" class="mb-3 space-y-2">
        <div v-if="sermon.hostPull && sermon.hostPull.state !== 'sent'" class="rounded-lg border border-default px-3 py-2 text-sm space-y-1">
          <p v-if="sermon.hostPull.state !== 'failed'">
            <UIcon name="i-lucide-loader-circle" class="w-4 h-4 mr-1.5 align-text-bottom animate-spin" />
            {{ sermon.hostPull.state === 'sending' ? 'Bringing a copy in from the video host…' : 'Waiting to bring a copy in from the video host…' }}
          </p>
          <template v-else>
            <p class="text-error"><UIcon name="i-lucide-circle-alert" class="w-4 h-4 mr-1.5 align-text-bottom" />Could not bring a copy in{{ sermon.hostPull.willRetry ? '; the site will try again by itself' : '' }}.</p>
            <p v-if="sermon.hostPull.error" class="text-muted text-xs">{{ sermon.hostPull.error }}</p>
          </template>
          <UButton v-if="sermon.hostPull.state === 'failed'" size="xs" color="neutral" variant="outline" icon="i-lucide-download" :loading="pulling" @click="bringIn">Try now</UButton>
        </div>
        <UButton v-else-if="sermon.hosted?.state === 'ready' && targets.host" size="xs" color="neutral" variant="outline" icon="i-lucide-download" :loading="pulling" @click="bringIn">Bring a copy here from the video host</UButton>
        <p v-else-if="sermon.videoId && !sermon.hosted" class="text-muted text-xs">This video is only on YouTube. YouTube does not give the original back, so a copy cannot be brought in. Upload the file here to keep a copy.</p>
      </div>

      <!-- Uploading now -->
      <div v-if="active" class="space-y-2">
        <UProgress :model-value="active.phase === 'starting' ? null : active.percent" />
        <p class="text-muted text-sm">
          <template v-if="active.phase === 'failed'">{{ active.error }}</template>
          <template v-else>{{ active.phase === 'starting' ? 'Getting ready to upload…' : `Uploading to ${active.target === 'youtube' ? 'YouTube' : active.target === 'local' ? 'the church server' : 'the church video host'}: ${active.percent}%.` }} You can close this form; keep the site open until it finishes. It resumes if the connection drops.</template>
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
      v-if="targets.youtube && !active && (!sermon?.hosted || replacing) && !(sermon && sermon.videoId && !replacing)"
      v-model="postToYouTube"
      :label="targets.host ? `Also post to YouTube (${targets.channelTitle})` : `Post to YouTube (${targets.channelTitle})`"
      :description="targets.local ? 'Unlisted, so only people with the link can find it. The church server posts it in the background, so nobody has to wait.' : 'Unlisted, so only people with the link can find it. Uploaded straight from this computer, so it takes about as long again.'"
    />

    <USwitch
      v-if="canPublish && (!sermon || sermon.status === 'draft') && (file || sermon?.hosted?.state === 'processing' || sermon?.publishWhenReady)"
      :model-value="publishWhenReady"
      :disabled="settingPublish"
      label="Publish as soon as the video is ready"
      description="The message goes live by itself when the video host finishes preparing it, even if nobody has this page open."
      @update:model-value="setPublishWhenReady"
    />

    <UModal v-model:open="confirmingRemoveLocal" title="Remove the copy on the church server?" description="This deletes the stored original. If it is the only copy of the file, it is gone for good. To keep a message on the video host without that risk, use “Keep only on the video host”, which first checks the host holds the same file.">
      <template #footer>
        <UButton color="neutral" variant="outline" @click="confirmingRemoveLocal = false">Keep it</UButton>
        <UButton color="error" :loading="removingLocal" @click="removeLocal">Remove it</UButton>
      </template>
    </UModal>

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
const postToYouTube = defineModel<boolean>('postToYouTube', { default: true })

const toast = useToast()
const uploads = useHostedVideoUploads()
uploads.onChanged((changed) => {
  if (changed.id === props.sermon?.id) emit('changed', changed)
})

const { targets, load: loadTargets } = useVideoTargets()
onMounted(() => loadTargets())

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
  void uploads.start(props.sermon, picked, { publishWhenReady: props.canPublish && props.sermon.status === 'draft' && wantsPublish.value, youtube: postToYouTube.value })
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

const auth = useAuthStore()
const canDelete = computed(() => auth.can({ sermon: ['delete'] }))
const formatBytes = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`
const releasing = ref(false)
const releaseLocal = async () => {
  if (!props.sermon) return
  releasing.value = true
  try {
    emit('changed', (await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${props.sermon.id}/local-copy/release`, { method: 'POST' })).sermon)
    toast.add({ title: 'Kept only on the video host', description: 'The church server’s copy was removed after the host was shown to hold the same original.', color: 'success' })
  }
  catch (error) {
    toast.add({ title: 'Nothing was removed', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    releasing.value = false
  }
}
const confirmingRemoveLocal = ref(false)
const removingLocal = ref(false)
const removeLocal = async () => {
  confirmingRemoveLocal.value = false
  if (!props.sermon) return
  removingLocal.value = true
  try {
    emit('changed', (await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${props.sermon.id}/local-copy`, { method: 'DELETE' })).sermon)
    toast.add({ title: 'Local copy removed', description: 'Copies on the video host or YouTube are not touched.', color: 'success' })
  }
  catch (error) {
    toast.add({ title: 'Not removed', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    removingLocal.value = false
  }
}

// The places the stored copy is sent on to, and where each stands.
const places = computed(() => [
  { target: 'host' as const, name: 'the video host', connected: targets.value.host, push: props.sermon?.hostPush ?? null, has: Boolean(props.sermon?.hosted) },
  { target: 'youtube' as const, name: 'YouTube', connected: targets.value.youtube, push: props.sermon?.youtubePush ?? null, has: Boolean(props.sermon?.videoId) },
])
const sending = ref<'host' | 'youtube' | null>(null)
const sendTo = async (target: 'host' | 'youtube') => {
  if (!props.sermon) return
  sending.value = target
  try {
    const path = target === 'host' ? 'hosted-video/push' : 'youtube-push'
    emit('changed', (await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${props.sermon.id}/${path}`, { method: 'POST' })).sermon)
    if (target === 'host') uploads.watchUntilReady(props.sermon.id)
  }
  catch (error) {
    toast.add({ title: 'Not sent', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    sending.value = null
  }
}

const pulling = ref(false)
const bringIn = async () => {
  if (!props.sermon) return
  pulling.value = true
  try {
    emit('changed', (await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${props.sermon.id}/local-copy/pull`, { method: 'POST' })).sermon)
  }
  catch (error) {
    toast.add({ title: 'Not started', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    pulling.value = false
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
