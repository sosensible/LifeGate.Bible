<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Church Office</p>
          <h1 class="text-4xl font-bold font-serif text-white">Shared broadcasts</h1>
          <p class="text-white/70 mt-2 max-w-2xl">A locked page on this site for a stream that comes from elsewhere. Members watch with no code; guests need a code made for them. A limit can cap how many people watch.</p>
        </div>
        <UButton color="secondary" icon="i-lucide-plus" @click="openEditor(null)">Add a broadcast</UButton>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-4">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Broadcasts could not be loaded.')" />
        <UEmpty v-else-if="!broadcasts.length" icon="i-lucide-radio" title="No broadcasts yet" description="Add one when you have a stream to share. It starts closed." />

        <div v-else class="bg-elevated rounded-lg border border-default overflow-x-auto">
          <UTable :data="broadcasts" :columns="columns">
            <template #title-cell="{ row }">
              <button type="button" class="text-left group" @click="openEditor(row.original)">
                <span class="block font-bold text-highlighted group-hover:text-primary">{{ row.original.title }}</span>
                <span class="block text-muted text-xs">/watch/{{ row.original.slug }}</span>
              </button>
            </template>
            <template #status-cell="{ row }">
              <UBadge variant="subtle" :color="row.original.availability === 'open' ? 'success' : row.original.availability === 'closed' ? 'neutral' : 'warning'">
                {{ row.original.availability === 'open' ? 'Open' : row.original.availability === 'closed' ? 'Ended' : 'Not open' }}
              </UBadge>
            </template>
            <template #audience-cell="{ row }"><span class="text-toned text-sm">{{ AUDIENCE_LABELS[row.original.audience] }}</span></template>
            <template #seats-cell="{ row }">
              <span class="text-toned text-sm">{{ row.original.seatsTaken }}{{ row.original.maxViewers ? ` of ${row.original.maxViewers}` : '' }}</span>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-link" :aria-label="`Copy the address of ${row.original.title}`" @click="copyLink(row.original)" />
                <UButton v-if="row.original.audience === 'members_and_guests'" size="xs" variant="ghost" color="neutral" icon="i-lucide-ticket" :aria-label="`Guest codes for ${row.original.title}`" @click="openCodes(row.original)" />
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-external-link" :to="`/watch/${row.original.slug}`" target="_blank" :aria-label="`Open ${row.original.title}`" />
                <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${row.original.title}`" @click="openEditor(row.original)" />
              </div>
            </template>
          </UTable>
        </div>
      </div>
    </div>

    <!-- Add or change -->
    <USlideover v-model:open="editorOpen" :title="editing ? 'Change the broadcast' : 'Add a broadcast'" :ui="{ content: 'max-w-xl', footer: 'justify-between' }">
      <template #body>
        <form id="broadcast-form" class="space-y-5" @submit.prevent="save">
          <UFormField label="Title" required><UInput v-model="draft.title" class="w-full" /></UFormField>
          <UFormField label="Notes" hint="Shown above the stream"><UTextarea v-model="draft.description" :rows="3" autoresize class="w-full" /></UFormField>
          <UFormField label="Stream address" required :help="streamHelp">
            <UInput v-model="draft.streamUrl" placeholder="https://" class="w-full" />
          </UFormField>
          <UFormField label="Who may watch">
            <URadioGroup v-model="draft.audience" :items="audienceItems" />
          </UFormField>
          <UFormField label="Most people in total" hint="Leave empty for no limit" help="Counts everyone who takes a place, members included. A member needs no code, but still takes a place.">
            <UInputNumber v-model="draft.maxViewers" :min="1" class="w-full sm:w-1/2" />
          </UFormField>
          <USwitch v-model="draft.isOpen" label="Open" description="Nobody can watch while this is off." />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Opens at" hint="Optional"><UInput v-model="draft.opensAt" type="datetime-local" class="w-full" /></UFormField>
            <UFormField label="Ends at" hint="Optional"><UInput v-model="draft.closesAt" type="datetime-local" class="w-full" /></UFormField>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex gap-2">
          <UButton v-if="editing" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmingDelete = true">Remove</UButton>
          <UButton v-if="editing && editing.seatsTaken" color="neutral" variant="ghost" icon="i-lucide-armchair" :loading="busy" @click="clearSeatsFor(editing)">Give all places back</UButton>
        </div>
        <div class="flex gap-2">
          <UButton color="neutral" variant="outline" @click="editorOpen = false">Cancel</UButton>
          <UButton type="submit" form="broadcast-form" :loading="busy">{{ editing ? 'Save' : 'Add' }}</UButton>
        </div>
      </template>
    </USlideover>

    <!-- Guest codes -->
    <UModal v-model:open="codesOpen" :title="codesFor ? `Guest codes: ${codesFor.title}` : 'Guest codes'" description="Each code is for one person, on one device. It is shown once, when made.">
      <template #body>
        <div v-if="codesFor" class="space-y-5">
          <UAlert v-if="shown" color="success" variant="subtle" icon="i-lucide-ticket" :title="`Code for ${shown.label}`">
            <template #description>
              <p class="text-2xl font-mono tracking-widest text-highlighted my-2 select-all">{{ shown.code }}</p>
              <p class="text-sm">Send this code and the address <span class="font-mono break-all">{{ link(codesFor) }}</span>. It will not be shown again; use <strong>New code</strong> if it is lost.</p>
              <UButton size="xs" class="mt-2" icon="i-lucide-copy" color="neutral" variant="outline" @click="copyInvitation">Copy the invitation</UButton>
            </template>
          </UAlert>

          <form class="flex gap-2" @submit.prevent="makeCode">
            <UInput v-model="newLabel" placeholder="Who is it for? e.g. Aunt May" class="flex-1" />
            <UButton type="submit" icon="i-lucide-plus" :loading="busy" :disabled="!newLabel.trim()">Make a code</UButton>
          </form>

          <ul v-if="codesFor.passes.length" class="divide-y divide-default rounded-lg border border-default">
            <li v-for="pass in codesFor.passes" :key="pass.id" class="p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="font-semibold text-highlighted">{{ pass.label }}</p>
                <p class="text-muted text-xs">{{ pass.state === 'revoked' ? 'Turned off' : pass.state === 'in-use' ? 'In use on a device' : 'Not used yet' }}</p>
              </div>
              <div v-if="pass.state !== 'revoked'" class="flex gap-1">
                <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="busy" @click="newCode(pass)">New code</UButton>
                <UButton size="xs" color="error" variant="ghost" icon="i-lucide-ban" :loading="busy" @click="turnOff(pass)">Turn off</UButton>
              </div>
            </li>
          </ul>
          <p v-else class="text-muted text-sm">No codes yet.</p>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="confirmingDelete" title="Remove this broadcast?" description="Its page, guest codes and places are removed. The stream itself is not touched.">
      <template #footer>
        <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep</UButton>
        <UButton color="error" :loading="busy" @click="remove">Remove</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { AUDIENCE_LABELS, BROADCAST_AUDIENCES, type BroadcastAdminView, type PassView } from '#shared/broadcast'

definePageMeta({ middleware: 'auth', permission: { liveMeeting: ['manage'] }, layout: 'default' })
useSeoMeta({ title: 'Shared broadcasts' })

const toast = useToast()
const { data, error, refresh } = await useFetch<{ broadcasts: BroadcastAdminView[] }>('/api/admin/broadcasts')
const broadcasts = computed(() => data.value?.broadcasts ?? [])

const columns: TableColumn<BroadcastAdminView>[] = [
  { id: 'title', header: 'Broadcast' },
  { id: 'status', header: 'Status' },
  { id: 'audience', header: 'Who may watch' },
  { id: 'seats', header: 'Places taken' },
  { id: 'actions', header: '' },
]
const audienceItems = BROADCAST_AUDIENCES.map(value => ({ value, label: AUDIENCE_LABELS[value] }))

// The text keeps {viewer} out of the template, where the braces confuse the type checker.
const streamHelp = 'Where the stream is shown from, starting with https://. Put {viewer} in it where the stream needs an id for each person watching.'

const busy = ref(false)
const guard = async (fn: () => Promise<void>, failure: string) => {
  busy.value = true
  try {
    await fn()
  }
  catch (err) {
    toast.add({ title: failure, description: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    busy.value = false
  }
}

// A time as the browser's date-and-time box wants it, and back.
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null)

const blank = () => ({ title: '', description: '', streamUrl: '', audience: 'members' as 'members' | 'members_and_guests', maxViewers: undefined as number | undefined, isOpen: false, opensAt: '', closesAt: '' })
const draft = reactive(blank())
const editorOpen = ref(false)
const editing = ref<BroadcastAdminView | null>(null)
const openEditor = (broadcast: BroadcastAdminView | null) => {
  editing.value = broadcast
  Object.assign(draft, broadcast
    ? { title: broadcast.title, description: broadcast.description ?? '', streamUrl: broadcast.streamUrl, audience: broadcast.audience, maxViewers: broadcast.maxViewers ?? undefined, isOpen: broadcast.isOpen, opensAt: toLocalInput(broadcast.opensAt), closesAt: toLocalInput(broadcast.closesAt) }
    : blank())
  editorOpen.value = true
}
const save = () => guard(async () => {
  const body = { title: draft.title, description: draft.description || null, streamUrl: draft.streamUrl, audience: draft.audience, maxViewers: draft.maxViewers ?? null, isOpen: draft.isOpen, opensAt: fromLocalInput(draft.opensAt), closesAt: fromLocalInput(draft.closesAt) }
  if (editing.value) await $fetch(`/api/admin/broadcasts/${editing.value.id}`, { method: 'PATCH', body })
  else await $fetch('/api/admin/broadcasts', { method: 'POST', body })
  await refresh()
  editorOpen.value = false
  toast.add({ title: editing.value ? 'Saved' : 'Broadcast added', color: 'success', icon: 'i-lucide-circle-check' })
}, 'Not saved')

const confirmingDelete = ref(false)
const remove = () => guard(async () => {
  if (!editing.value) return
  await $fetch(`/api/admin/broadcasts/${editing.value.id}`, { method: 'DELETE' })
  confirmingDelete.value = false
  editorOpen.value = false
  await refresh()
}, 'Not removed')
const clearSeatsFor = (broadcast: BroadcastAdminView) => guard(async () => {
  await $fetch(`/api/admin/broadcasts/${broadcast.id}/seats`, { method: 'DELETE' })
  await refresh()
  editing.value = broadcasts.value.find(b => b.id === broadcast.id) ?? null
  toast.add({ title: 'Every place is free again', color: 'success' })
}, 'Not cleared')

// The address people use to watch.
const link = (broadcast: BroadcastAdminView) => `${import.meta.client ? location.origin : ''}/watch/${broadcast.slug}`
const copyLink = async (broadcast: BroadcastAdminView) => {
  await navigator.clipboard.writeText(link(broadcast))
  toast.add({ title: 'Address copied', color: 'success', icon: 'i-lucide-copy' })
}

// Guest codes.
const codesOpen = ref(false)
const codesForId = ref<string | null>(null)
const codesFor = computed(() => broadcasts.value.find(b => b.id === codesForId.value) ?? null)
const newLabel = ref('')
const shown = ref<{ label: string, code: string } | null>(null)
const openCodes = (broadcast: BroadcastAdminView) => {
  codesForId.value = broadcast.id
  shown.value = null
  newLabel.value = ''
  codesOpen.value = true
}
const makeCode = () => guard(async () => {
  if (!codesFor.value) return
  const label = newLabel.value.trim()
  const { code } = await $fetch<{ code: string }>(`/api/admin/broadcasts/${codesFor.value.id}/passes`, { method: 'POST', body: { label } })
  shown.value = { label, code }
  newLabel.value = ''
  await refresh()
}, 'No code made')
const newCode = (pass: PassView) => guard(async () => {
  if (!codesFor.value) return
  const { code } = await $fetch<{ code: string }>(`/api/admin/broadcasts/${codesFor.value.id}/passes/${pass.id}/reset`, { method: 'POST' })
  shown.value = { label: pass.label, code }
  await refresh()
}, 'No new code')
const turnOff = (pass: PassView) => guard(async () => {
  if (!codesFor.value) return
  await $fetch(`/api/admin/broadcasts/${codesFor.value.id}/passes/${pass.id}`, { method: 'DELETE' })
  await refresh()
}, 'Not turned off')
const copyInvitation = async () => {
  if (!shown.value || !codesFor.value) return
  await navigator.clipboard.writeText(`You are invited to watch “${codesFor.value.title}”.\n\nGo to: ${link(codesFor.value)}\nYour code: ${shown.value.code}\n\nThe code is for you alone, on one device.`)
  toast.add({ title: 'Invitation copied', color: 'success', icon: 'i-lucide-copy' })
}
</script>
