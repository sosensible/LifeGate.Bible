<template>
  <div>
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">Members Directory</h1>
      </div>
    </div>

    <!-- Search -->
    <div class="bg-muted border-b border-default py-5 px-6">
      <div class="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <UTabs v-if="data?.speakers.length || canManageSpeakers" v-model="tab" :items="tabs" :content="false" class="w-full sm:w-auto" />
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search by name or ministry..."
          size="lg"
          class="w-full max-w-md"
        />
        <UButton v-if="tab === 'speakers' && canManageSpeakers" icon="i-lucide-plus" @click="editSpeaker(null)">Add speaker</UButton>
        <UButton v-else to="/profile" variant="link" color="primary" icon="i-lucide-eye">Choose what others see about you</UButton>
      </div>
    </div>

    <!-- Cards -->
    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <UAlert
          v-if="data?.viewer.isStaff"
          color="neutral"
          variant="subtle"
          icon="i-lucide-shield"
          description="You see phone numbers, emails and addresses because you serve on staff. Birthdays and households appear only when a person shares them."
          class="mb-6"
        />

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" description="The directory could not be loaded. Please try again." />

        <div v-else-if="filtered.length === 0" class="text-center py-16">
          <p class="font-serif text-xl text-muted mb-2">{{ tab === 'speakers' ? 'No speakers found' : 'No members found' }}</p>
          <p v-if="search" class="text-muted text-sm">Try a different name or ministry</p>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <DirectoryCard
            v-for="entry in filtered"
            :key="entry.id"
            :entry="entry"
            :badge="'guest' in entry ? (entry.guest ? 'Guest speaker' : 'Member') : undefined"
          >
            <template v-if="tab === 'speakers' && canManageSpeakers" #actions>
              <UButton v-if="'guest' in entry && entry.guest" size="xs" variant="outline" color="neutral" icon="i-lucide-pencil" @click="editSpeaker(entry.id)">Edit</UButton>
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-archive" @click="archivingSpeaker = entry">Archive</UButton>
            </template>
          </DirectoryCard>
        </div>

        <!-- Speakers archive: staff and admins -->
        <LazyArchiveAccordion v-if="tab === 'speakers' && speakerAdmin?.archived" :sections="speakerArchive" class="mt-10" @changed="refreshSpeakers" />
      </div>
    </div>

    <template v-if="canManageSpeakers">
      <LazySpeakerSlideover v-model:open="speakerOpen" :speaker="editingSpeaker" :candidates="speakerAdmin?.candidates ?? []" @saved="refreshSpeakers" @archived="refreshSpeakers" />
      <LazySpeakerArchiveModal :open="Boolean(archivingSpeaker)" :speaker="archivingSpeaker" @update:open="value => { if (!value) archivingSpeaker = null }" @archived="refreshSpeakers" />
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  permission: { directory: ['view'] },
  layout: 'default',
})
import type { ArchiveSection } from '~/components/ArchiveAccordion.vue'

useSeoMeta({ title: 'Members Directory | Lifegate Baptist Church' })

const auth = useAuthStore()
const route = useRoute()

// Every entry is already filtered by the server for this viewer.
const { data, error, refresh } = await useFetch('/api/directory')

const search = ref('')

// Speakers include guest speakers, who are not church members. /directory?tab=speakers opens that list.
const tab = computed<'members' | 'speakers'>({
  get: () => (route.query.tab === 'speakers' ? 'speakers' : 'members'),
  set: value => navigateTo({ query: { ...route.query, tab: value === 'speakers' ? 'speakers' : undefined } }, { replace: true }),
})
const tabs = [
  { label: 'Members', value: 'members', icon: 'i-lucide-users' },
  { label: 'Speakers', value: 'speakers', icon: 'i-lucide-mic' },
]

// Keeping the Speakers list: contentEditor, staff and admins. Staff and admins also get the archive.
const canManageSpeakers = computed(() => auth.can({ speakers: ['update'] }))
const { data: speakerAdmin, refresh: refreshSpeakerAdmin } = await useFetch('/api/speakers', { immediate: canManageSpeakers.value })
const refreshSpeakers = () => Promise.all([refresh(), refreshSpeakerAdmin()])

const speakerOpen = ref(false)
const editingSpeaker = ref<NonNullable<typeof speakerAdmin.value>['speakers'][number] | null>(null)
const editSpeaker = (id: string | null) => {
  editingSpeaker.value = id ? speakerAdmin.value?.speakers.find(s => s.id === id) ?? null : null
  speakerOpen.value = true
}
const archivingSpeaker = ref<{ id: string, firstName: string, lastName: string } | null>(null)

const speakerArchive = computed<ArchiveSection[]>(() => [{
  label: 'Speakers',
  items: (speakerAdmin.value?.archived ?? []).map(s => ({
    id: s.id,
    name: fullName(s),
    detail: s.kind === 'guest' ? 'Guest speaker' : 'Member',
    archivedAt: s.archivedAt!,
  })),
  base: item => `/api/speakers/${item.id}`,
  removeWarning: item => speakerAdmin.value?.archived?.find(s => s.id === item.id)?.kind === 'guest'
    ? `${item.name}'s guest record will be deleted. This cannot be undone.`
    : `${item.name} will no longer be a speaker. They stay in the directory as a member.`,
}])

const filtered = computed(() => {
  const entries = (tab.value === 'speakers' ? data.value?.speakers : data.value?.entries) ?? []
  const q = search.value.trim().toLowerCase()
  if (!q) return entries
  return entries.filter(entry =>
    fullName(entry).toLowerCase().includes(q)
    || entry.ministries?.some(ministry => ministry.name.toLowerCase().includes(q)),
  )
})
</script>
