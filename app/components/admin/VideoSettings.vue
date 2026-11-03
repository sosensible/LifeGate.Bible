<template>
  <UAccordion
    :items="[{ label: 'Video', icon: 'i-lucide-video', value: 'video' }]"
    type="single"
    collapsible
    class="bg-elevated rounded-lg border border-default px-6"
    :ui="{ trigger: 'text-lg font-serif font-bold text-highlighted py-5', body: 'pb-6' }"
  >
    <template #body>
      <!-- Only an administrator may enter or change these -->
      <UAlert
        v-if="!canManage"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        title="An Admin has to update this"
        description="The church video host and the YouTube channel are connected by an Admin, because they use the site’s own keys. Ask an Admin to open this section and enter them. Videos can still be posted to YouTube by hand and pasted into a message."
      />

      <div v-else class="space-y-6">
        <p class="text-muted text-sm">
          Where a message’s video is kept and posted. Volunteers choose a file once in the message form; these connections decide where it goes.
          Keys are kept encrypted and are never shown again after they are saved.
          <NuxtLink to="/help/connecting-video-and-youtube" class="text-primary hover:underline">Read the setup guide</NuxtLink>.
        </p>

        <UAlert v-if="loadError" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(loadError, 'The video settings could not be loaded.')" />

        <template v-else-if="view">
          <!-- Our own copy, on this server -->
          <section class="rounded-lg border border-default p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 class="font-serif text-xl font-bold text-highlighted">Copy on the church server</h3>
                <p class="text-muted text-sm">Keeps the original of each video here too, so it survives the video host or YouTube going away. Videos are filed by year and message name, with a checksum.</p>
              </div>
              <UBadge variant="subtle" :color="local?.writable ? 'success' : 'neutral'" :icon="local?.writable ? 'i-lucide-circle-check' : 'i-lucide-hard-drive'">
                {{ local?.writable ? 'On' : local?.path ? 'Folder not usable' : 'Off' }}
              </UBadge>
            </div>

            <!-- Videos are stored: the folder is changed by moving them, which copies and checks every one first -->
            <div v-if="local?.stored.count || local?.move" class="space-y-4">
              <p class="text-sm"><span class="font-semibold text-highlighted">{{ local?.path }}</span><span class="text-muted"> · {{ local?.stored.count }} stored {{ local?.stored.count === 1 ? 'video' : 'videos' }}, {{ formatFree(local?.stored.bytes ?? 0) }}</span></p>
              <p v-if="local?.writable && local.freeBytes !== null" class="text-muted text-sm">About {{ formatFree(local.freeBytes) }} free on that disk.</p>

              <div v-if="local?.move && local.move.state !== 'done'" class="rounded-lg border border-default p-4 space-y-3">
                <p class="text-sm font-semibold text-highlighted">{{ local.move.state === 'running' ? 'Moving the stored videos…' : 'The move stopped' }}</p>
                <UProgress :model-value="local.move.filesTotal ? Math.round((local.move.filesMoved / local.move.filesTotal) * 100) : 0" />
                <p class="text-muted text-sm">{{ local.move.filesMoved }} of {{ local.move.filesTotal }} copied and checked, into <code class="text-xs">{{ local.move.to }}</code>. The old folder is still in use until all are safely there.</p>
                <p v-if="local.move.error" class="text-sm text-error">{{ local.move.error }}</p>
                <div v-if="local.move.state === 'failed'" class="flex gap-2">
                  <UButton size="sm" icon="i-lucide-rotate-cw" :loading="moveBusy" @click="moveAction('move-retry')">Try again</UButton>
                  <UButton size="sm" color="neutral" variant="outline" :loading="moveBusy" @click="moveAction('move-cancel')">Give up and keep the old folder</UButton>
                </div>
              </div>
              <UAlert v-else-if="local?.move?.state === 'done'" color="success" variant="subtle" icon="i-lucide-circle-check" :title="`Moved ${local.move.filesTotal} ${local.move.filesTotal === 1 ? 'video' : 'videos'}`" :description="`They are now in ${local.move.to}.`" />

              <form v-if="!local?.move || local.move.state === 'done'" class="space-y-3" @submit.prevent="confirmingMove = true">
                <UFormField label="Move the stored videos to another folder" help="Every video is copied and checked against its checksum first. Only when all are safely in the new folder does the site switch, and then the old files are removed. Uploads wait while it runs.">
                  <div class="flex items-center gap-2">
                    <UInput v-model="form.moveTo" placeholder="Full path of the new folder" autocomplete="off" class="flex-1" />
                    <UButton color="neutral" variant="outline" icon="i-lucide-folder-search" @click="browsing = 'moveTo'">Browse</UButton>
                  </div>
                </UFormField>
                <div class="flex flex-wrap items-center gap-2">
                  <UButton type="submit" icon="i-lucide-folder-input" :disabled="!form.moveTo.trim()">Move the stored videos</UButton>
                  <UButton v-if="view['local.path'].source === 'ui'" variant="ghost" color="error" icon="i-lucide-power" :loading="saving === 'local'" @click="clear('local.path')">Turn off</UButton>
                </div>
              </form>
            </div>

            <form v-else class="space-y-4" @submit.prevent="saveLocal">
              <UFormField label="Folder on the server" :help="localHelp">
                <div class="flex items-center gap-2">
                  <UInput v-model="form.localPath" placeholder="Full path of the folder" autocomplete="off" class="flex-1" />
                  <UButton color="neutral" variant="outline" icon="i-lucide-folder-search" @click="browsing = 'localPath'">Browse</UButton>
                </div>
              </UFormField>
              <p v-if="local?.writable && local.freeBytes !== null" class="text-muted text-sm">About {{ formatFree(local.freeBytes) }} free on that disk. One message is roughly 1.5 to 2 GB.</p>
              <div class="flex flex-wrap items-center gap-2">
                <UButton type="submit" icon="i-lucide-save" :loading="saving === 'local'" :disabled="!localChanged">Save folder</UButton>
                <UButton v-if="view['local.path'].source === 'ui'" variant="ghost" color="error" icon="i-lucide-power" :loading="saving === 'local'" @click="clear('local.path')">Turn off</UButton>
              </div>
            </form>
            <div v-if="local?.writable" class="flex flex-wrap items-center gap-2 border-t border-default pt-4">
              <UButton size="xs" icon="i-lucide-folder-input" @click="importing = true">Import videos from the folder</UButton>
              <span class="text-muted ml-2 text-sm">Send every stored video again to:</span>
              <UButton v-if="targets.host" size="xs" color="neutral" variant="outline" icon="i-lucide-send" :disabled="!local.stored.count" @click="resendTarget = 'host'">the video host</UButton>
              <UButton v-if="targets.youtube" size="xs" color="neutral" variant="outline" icon="i-lucide-send" :disabled="!local.stored.count" @click="resendTarget = 'youtube'">YouTube</UButton>
              <span v-if="!targets.host && !targets.youtube" class="text-muted text-sm">connect the video host or YouTube first</span>
            </div>
            <p class="text-muted text-xs">Give the full path as the server sees it. If the site runs in a container, choose a folder on a mounted volume, or the videos are lost when the site is updated. Back this folder up like any other important data. Turning it off keeps the files already there.</p>
          </section>

          <!-- The church's own video host -->
          <section class="rounded-lg border border-default p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 class="font-serif text-xl font-bold text-highlighted">Church video host <span class="text-muted text-base font-normal">(Bunny Stream)</span></h3>
                <p class="text-muted text-sm">Our own copy of each video, played only for people who may watch it.</p>
              </div>
              <UBadge variant="subtle" :color="targets.host ? 'success' : 'neutral'" :icon="targets.host ? 'i-lucide-circle-check' : 'i-lucide-plug-zap'">
                {{ targets.host ? 'Connected' : 'Not connected yet' }}
              </UBadge>
            </div>

            <form class="space-y-4" @submit.prevent="saveHost">
              <UFormField label="Library ID" :help="note('bunny.libraryId')">
                <UInput v-model="form.libraryId" inputmode="numeric" class="w-full" />
              </UFormField>
              <UFormField label="Library API key" :help="note('bunny.apiKey')">
                <div class="flex gap-2">
                  <UInput v-model="form.apiKey" type="password" autocomplete="off" :placeholder="placeholder('bunny.apiKey')" class="flex-1" />
                  <UButton v-if="view['bunny.apiKey'].source === 'ui'" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Remove the saved API key" @click="clear('bunny.apiKey')" />
                </div>
              </UFormField>
              <UFormField label="Token authentication key" :help="note('bunny.tokenKey')">
                <div class="flex gap-2">
                  <UInput v-model="form.tokenKey" type="password" autocomplete="off" :placeholder="placeholder('bunny.tokenKey')" class="flex-1" />
                  <UButton v-if="view['bunny.tokenKey'].source === 'ui'" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Remove the saved token key" @click="clear('bunny.tokenKey')" />
                </div>
              </UFormField>
              <UFormField label="Delivery hostname" :help="note('bunny.cdnHost') + ' Only needed to bring a video back from the video host onto the church server.'">
                <UInput v-model="form.cdnHost" placeholder="vz-abc123-xyz.b-cdn.net" autocomplete="off" class="w-full" />
              </UFormField>
              <UButton type="submit" icon="i-lucide-save" :loading="saving === 'host'" :disabled="!hostChanged">Save video host</UButton>
            </form>
            <p class="text-muted text-xs">These are Bunny Stream’s own settings. Where to find each one is in the <NuxtLink to="/help/setting-up-the-video-host" class="text-primary hover:underline">video host guide</NuxtLink>.</p>
          </section>

          <!-- YouTube -->
          <section class="rounded-lg border border-default p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 class="font-serif text-xl font-bold text-highlighted">YouTube channel</h3>
                <p class="text-muted text-sm">Post a message’s video to the church’s channel, unlisted, from the message form.</p>
              </div>
              <UBadge variant="subtle" :color="status?.connected ? 'success' : 'neutral'" :icon="status?.connected ? 'i-lucide-circle-check' : 'i-lucide-plug-zap'">
                {{ status?.connected ? `Connected: ${status.channelTitle}` : status?.configured ? 'Ready to connect' : 'Not set up yet' }}
              </UBadge>
            </div>

            <div v-if="status?.redirectUri">
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase mb-1">Address to give Google (step 5 of the guide)</p>
              <code class="block break-all rounded bg-muted px-2 py-1 text-xs">{{ status.redirectUri }}</code>
            </div>

            <form class="space-y-4" @submit.prevent="saveYouTube">
              <UFormField label="Client ID" :help="note('youtube.clientId')">
                <UInput v-model="form.clientId" autocomplete="off" class="w-full" />
              </UFormField>
              <UFormField label="Client secret" :help="note('youtube.clientSecret')">
                <div class="flex gap-2">
                  <UInput v-model="form.clientSecret" type="password" autocomplete="off" :placeholder="placeholder('youtube.clientSecret')" class="flex-1" />
                  <UButton v-if="view['youtube.clientSecret'].source === 'ui'" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Remove the saved client secret" @click="clear('youtube.clientSecret')" />
                </div>
              </UFormField>
              <UAlert v-if="status?.connected && youtubeChanged" color="warning" variant="subtle" icon="i-lucide-triangle-alert" description="Changing these ends the current YouTube connection. You will connect the channel again afterwards." />
              <UButton type="submit" icon="i-lucide-save" :loading="saving === 'youtube'" :disabled="!youtubeChanged">Save YouTube keys</UButton>
            </form>

            <div class="flex flex-wrap items-center gap-2 border-t border-default pt-4">
              <template v-if="status?.configured">
                <UButton v-if="!status.connected" to="/api/admin/youtube/connect" external icon="i-lucide-link">Connect YouTube channel</UButton>
                <template v-else>
                  <UButton to="/api/admin/youtube/connect" external variant="outline" color="neutral" icon="i-lucide-refresh-cw">Connect a different channel</UButton>
                  <UButton variant="ghost" color="error" icon="i-lucide-unplug" @click="confirming = true">Disconnect</UButton>
                </template>
              </template>
              <p v-else class="text-muted text-sm">Save the client ID and secret first, then connect the channel here.</p>
              <NuxtLink to="/help/setting-up-youtube" class="text-primary text-sm hover:underline ml-1">YouTube guide</NuxtLink>
            </div>
          </section>
        </template>
      </div>

      <AdminVideoImport v-model:open="importing" @imported="load" />

      <AdminFolderPicker :open="browsing !== null" :start="browsing ? form[browsing] : ''" @update:open="closeBrowser" @choose="chosenFolder" />

      <UModal v-model:open="confirmingMove" title="Move the stored videos?" :description="`${local?.stored.count ?? 0} videos (${formatFree(local?.stored.bytes ?? 0)}) will be copied to ${form.moveTo.trim()} and each one checked. The site switches to the new folder only when all are safely there. Uploads wait while it runs.`">
        <template #footer>
          <UButton color="neutral" variant="outline" @click="confirmingMove = false">Cancel</UButton>
          <UButton :loading="moveBusy" @click="startMove">Move them</UButton>
        </template>
      </UModal>

      <UModal :open="resendTarget !== null" title="Send every stored video again?" :description="resendTarget === 'host' ? 'Each stored video is sent to the video host again. A new copy replaces the old one only once it has fully arrived. Use this after connecting a new video library.' : 'Each stored video is posted to YouTube again, as unlisted, and its message is pointed at the new video. The earlier videos stay on the channel.'" @update:open="value => { if (!value) resendTarget = null }">
        <template #footer>
          <UButton color="neutral" variant="outline" @click="resendTarget = null">Cancel</UButton>
          <UButton :loading="moveBusy" @click="resend">Send them all again</UButton>
        </template>
      </UModal>

      <UModal v-model:open="confirming" title="Disconnect the YouTube channel?" description="The site forgets its access to the channel. Videos already on YouTube stay where they are, and messages keep their links.">
        <template #footer>
          <UButton color="neutral" variant="outline" @click="confirming = false">Keep it</UButton>
          <UButton color="error" :loading="disconnecting" @click="disconnect">Disconnect</UButton>
        </template>
      </UModal>
    </template>
  </UAccordion>
</template>

<script setup lang="ts">
import type { FolderMoveView } from '#shared/folder-move'
import type { IntegrationField, IntegrationView } from '#shared/integrations'
import type { YouTubeStatus } from '#shared/youtube-status'

const auth = useAuthStore()
const toast = useToast()
const route = useRoute()
const { targets, load: loadTargets } = useVideoTargets()

// Only an Admin may enter or change these; everyone else is told to ask one.
const canManage = computed(() => auth.can({ integrations: ['manage'] }))

const view = ref<IntegrationView | null>(null)
const status = ref<YouTubeStatus | null>(null)
const loadError = ref<unknown>(null)
const form = reactive({ libraryId: '', apiKey: '', tokenKey: '', cdnHost: '', clientId: '', clientSecret: '', localPath: '', moveTo: '' })
type LocalStatus = { path: string | null, writable: boolean, freeBytes: number | null, stored: { count: number, bytes: number }, move: FolderMoveView | null }
const local = ref<LocalStatus | null>(null)
// Which folder box the folder chooser is filling in, while it is open.
const browsing = ref<'localPath' | 'moveTo' | null>(null)
const closeBrowser = (open: boolean) => {
  if (!open) browsing.value = null
}
const chosenFolder = (path: string) => {
  if (browsing.value) form[browsing.value] = path
}

const load = async () => {
  if (!canManage.value) return
  try {
    const [settings, youtube, folder] = await Promise.all([
      $fetch<IntegrationView>('/api/admin/video-settings'),
      $fetch<YouTubeStatus>('/api/admin/youtube'),
      $fetch<LocalStatus>('/api/admin/local-video'),
    ])
    view.value = settings
    status.value = youtube
    local.value = folder
    form.localPath = settings['local.path'].value ?? ''
    form.cdnHost = settings['bunny.cdnHost'].value ?? ''
    form.libraryId = settings['bunny.libraryId'].value ?? ''
    form.clientId = settings['youtube.clientId'].value ?? ''
    form.apiKey = form.tokenKey = form.clientSecret = ''
    loadError.value = null
  }
  catch (error) {
    loadError.value = error
  }
  await loadTargets(true)
}

const SOURCE_NOTES = {
  ui: 'Saved here.',
  env: 'Set in the server’s settings. Enter a value here to replace it.',
  unreadable: 'Saved, but it can no longer be read. Enter it again.',
} as const
const note = (name: IntegrationField) => {
  const source = view.value?.[name].source
  return source ? SOURCE_NOTES[source] : 'Not set yet.'
}
const placeholder = (name: IntegrationField) => view.value?.[name].source ? 'Saved. Leave blank to keep it.' : 'Paste it here'

// What would be sent: only the fields that were filled in, or the id if it was changed.
const hostChanged = computed(() => Boolean(form.apiKey || form.tokenKey || (form.libraryId.trim() && form.libraryId.trim() !== view.value?.['bunny.libraryId'].value) || (form.cdnHost.trim() && form.cdnHost.trim() !== view.value?.['bunny.cdnHost'].value)))
const youtubeChanged = computed(() => Boolean(form.clientSecret || (form.clientId.trim() && form.clientId.trim() !== view.value?.['youtube.clientId'].value)))

const saving = ref<'host' | 'youtube' | 'local' | null>(null)
const send = async (kind: 'host' | 'youtube' | 'local', body: Partial<Record<IntegrationField, string | null>>, success: string) => {
  saving.value = kind
  try {
    const result = await $fetch<{ youtubeDisconnected: boolean }>('/api/admin/video-settings', { method: 'PUT', body })
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' })
    if (result.youtubeDisconnected) toast.add({ title: 'YouTube was disconnected', description: 'Its keys changed, so connect the channel again.', color: 'warning', icon: 'i-lucide-triangle-alert' })
    await load()
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = null
  }
}

const saveHost = () => send('host', {
  ...(form.libraryId.trim() && form.libraryId.trim() !== view.value?.['bunny.libraryId'].value ? { 'bunny.libraryId': form.libraryId.trim() } : {}),
  ...(form.apiKey ? { 'bunny.apiKey': form.apiKey } : {}),
  ...(form.tokenKey ? { 'bunny.tokenKey': form.tokenKey } : {}),
  ...(form.cdnHost.trim() && form.cdnHost.trim() !== view.value?.['bunny.cdnHost'].value ? { 'bunny.cdnHost': form.cdnHost.trim() } : {}),
}, 'Video host saved')

const saveYouTube = () => send('youtube', {
  ...(form.clientId.trim() && form.clientId.trim() !== view.value?.['youtube.clientId'].value ? { 'youtube.clientId': form.clientId.trim() } : {}),
  ...(form.clientSecret ? { 'youtube.clientSecret': form.clientSecret } : {}),
}, 'YouTube keys saved')

const localChanged = computed(() => Boolean(form.localPath.trim() && form.localPath.trim() !== view.value?.['local.path'].value))
const saveLocal = () => send('local', { 'local.path': form.localPath.trim() }, 'Folder saved')
const localHelp = computed(() => {
  const source = view.value?.['local.path'].source
  if (local.value?.path && !local.value.writable) return 'The server cannot write to this folder right now.'
  return source === 'env' ? 'Set in the server’s settings. Enter a folder here to replace it.' : source === 'ui' ? 'Saved here.' : 'Not set. Local copies are off.'
})
const formatFree = (bytes: number) => bytes >= 1e12 ? `${(bytes / 1e12).toFixed(1)} TB` : `${Math.round(bytes / 1e9)} GB`

const clear = (name: IntegrationField) => send(name.startsWith('bunny') ? 'host' : name.startsWith('local') ? 'local' : 'youtube', { [name]: null }, 'Removed')

// Google sends the person back here with the result in the address.
onMounted(async () => {
  await load()
  const result = route.query.youtube
  if (!result) return
  if (result === 'connected') toast.add({ title: 'YouTube channel connected', color: 'success', icon: 'i-lucide-circle-check' })
  else toast.add({ title: 'YouTube was not connected', description: String(route.query.message ?? ''), color: 'error', icon: 'i-lucide-circle-alert' })
  await navigateTo({ path: route.path }, { replace: true })
  await load()
})

// Moving the stored videos, and sending them all again.
const confirmingMove = ref(false)
const importing = ref(false)
const resendTarget = ref<'host' | 'youtube' | null>(null)
const moveBusy = ref(false)
const startMove = async () => {
  moveBusy.value = true
  try {
    await $fetch('/api/admin/local-video/move', { method: 'POST', body: { to: form.moveTo.trim() } })
    confirmingMove.value = false
    form.moveTo = ''
    await load()
  }
  catch (error) {
    confirmingMove.value = false
    toast.add({ title: 'Not moved', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    moveBusy.value = false
  }
}
const moveAction = async (action: 'move-retry' | 'move-cancel') => {
  moveBusy.value = true
  try {
    await $fetch(`/api/admin/local-video/${action}`, { method: 'POST' })
    await load()
  }
  catch (error) {
    toast.add({ title: 'Not done', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    moveBusy.value = false
  }
}
const resend = async () => {
  if (!resendTarget.value) return
  moveBusy.value = true
  try {
    const { queued } = await $fetch<{ queued: number }>('/api/admin/local-video/resend', { method: 'POST', body: { target: resendTarget.value } })
    toast.add({ title: `${queued} ${queued === 1 ? 'video' : 'videos'} queued`, description: 'They are sent in the background, one at a time.', color: 'success', icon: 'i-lucide-circle-check' })
    resendTarget.value = null
  }
  catch (error) {
    toast.add({ title: 'Not sent', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    moveBusy.value = false
  }
}
// While a move runs, look again every 3 seconds.
let moveTimer: ReturnType<typeof setInterval> | null = null
watch(() => local.value?.move?.state, (state) => {
  if (moveTimer) clearInterval(moveTimer)
  moveTimer = state === 'running' ? setInterval(() => { void load() }, 3000) : null
}, { immediate: true })
onBeforeUnmount(() => { if (moveTimer) clearInterval(moveTimer) })

const confirming = ref(false)
const disconnecting = ref(false)
const disconnect = async () => {
  disconnecting.value = true
  try {
    await $fetch('/api/admin/youtube', { method: 'DELETE' })
    confirming.value = false
    toast.add({ title: 'YouTube channel disconnected', color: 'success' })
    await load()
  }
  catch (error) {
    toast.add({ title: 'Not disconnected', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    disconnecting.value = false
  }
}
</script>
