<template>
  <UModal v-model:open="open" title="Choose a folder on the server" description="Look through the server’s folders, make a new one if you need it, and press Use this folder.">
    <template #body>
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <UButton color="neutral" variant="outline" icon="i-lucide-hard-drive" :disabled="loading || listing?.path === null" aria-label="Show all drives" @click="go('')">Drives</UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-arrow-up" :disabled="loading || listing?.path === null || !listing" aria-label="Up one folder" @click="go(listing?.parent ?? '')" />
          <code class="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{{ listing?.path ?? 'Drives and mounted folders' }}</code>
        </div>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
        <p v-else-if="listing?.path && listing.writable" class="flex items-center gap-1.5 text-sm text-success">
          <UIcon name="i-lucide-circle-check" class="size-4 shrink-0" />
          The server can save files in this folder<template v-if="listing.freeBytes !== null"> · about {{ Math.round(listing.freeBytes / 1e9) }} GB free</template>.
        </p>
        <p v-else-if="listing?.path" class="flex items-center gap-1.5 text-sm text-warning">
          <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
          The server can look here but cannot save files in it. Pick another folder, or make one that it can.
        </p>

        <div class="max-h-72 overflow-y-auto rounded-lg border border-default">
          <p v-if="loading" class="text-muted p-3 text-sm">Looking…</p>
          <p v-else-if="listing && !listing.folders.length" class="text-muted p-3 text-sm">{{ listing.path === null ? 'No drives or mounted folders were found. If the site runs in a container, mount a folder or drive into it first.' : 'No folders in here.' }}</p>
          <ul v-else class="divide-y divide-default">
            <li v-for="folder in listing?.folders" :key="folder.path">
              <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" @click="go(folder.path)">
                <UIcon :name="listing?.path === null ? 'i-lucide-hard-drive' : 'i-lucide-folder'" class="text-muted size-4 shrink-0" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate">{{ folder.name }}</span>
                  <span v-if="listing?.path === null" class="text-muted block truncate text-xs">{{ folder.path }}</span>
                </span>
                <span v-if="listing?.path === null" class="shrink-0 text-xs" :class="folder.writable ? 'text-muted' : 'text-warning'">
                  {{ folder.writable ? (folder.freeBytes != null ? `${Math.round(folder.freeBytes / 1e9)} GB free` : 'can save here') : 'read only' }}
                </span>
              </button>
            </li>
          </ul>
        </div>
        <p v-if="listing?.path === null" class="text-muted text-xs">Pick a drive, then the folder on it. Choose a second drive over the main drive if you want the videos kept off the system disk.</p>
        <p v-if="listing?.more" class="text-muted text-xs">Only the first {{ listing.folders.length }} folders are shown. Type a name above to narrow it down, or type the path instead.</p>

        <form v-if="listing?.path" class="flex items-center gap-2" @submit.prevent="make">
          <UInput v-model="newName" placeholder="New folder name" autocomplete="off" class="flex-1" />
          <UButton type="submit" color="neutral" variant="outline" icon="i-lucide-folder-plus" :loading="making" :disabled="!newName.trim()">Make folder</UButton>
        </form>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
      <UButton icon="i-lucide-check" :disabled="!listing?.path || !listing.writable" @click="choose">Use this folder</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
// Lets an Admin look through the server's folders and make a new one, instead of typing a path.
// Folders only. The server decides what can be seen; this only asks (see server/lib/folder-browser.ts).
interface Listing { path: string | null, parent: string | null, folders: { name: string, path: string, freeBytes?: number | null, writable?: boolean }[], more: boolean, writable: boolean, freeBytes: number | null }

const props = defineProps<{ start?: string }>()
const emit = defineEmits<{ choose: [path: string] }>()
const open = defineModel<boolean>('open', { default: false })

const listing = ref<Listing | null>(null)
const loading = ref(false)
const error = ref('')
const newName = ref('')
const making = ref(false)

const go = async (path?: string) => {
  loading.value = true
  error.value = ''
  try {
    listing.value = await $fetch<Listing>('/api/admin/local-video/folders', { query: path === undefined ? {} : { path } })
  }
  catch (failure) {
    error.value = apiErrorMessage(failure, 'That folder could not be opened.')
  }
  finally {
    loading.value = false
  }
}

const make = async () => {
  if (!listing.value?.path) return
  making.value = true
  error.value = ''
  try {
    const made = await $fetch<{ path: string }>('/api/admin/local-video/folders', { method: 'POST', body: { parent: listing.value.path, name: newName.value } })
    newName.value = ''
    await go(made.path)
  }
  catch (failure) {
    error.value = apiErrorMessage(failure, 'The folder could not be made.')
  }
  finally {
    making.value = false
  }
}

const choose = () => {
  if (!listing.value?.path) return
  emit('choose', listing.value.path)
  open.value = false
}

// Each time it opens, start where the typed path points (or where the videos already are).
watch(open, (isOpen) => {
  if (!isOpen) return
  newName.value = ''
  void go(props.start?.trim() ? props.start.trim() : undefined)
})
</script>
