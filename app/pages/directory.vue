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
        <UTabs v-if="data?.speakers.length" v-model="tab" :items="tabs" :content="false" class="w-full sm:w-auto" />
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search by name or ministry..."
          size="lg"
          class="w-full max-w-md"
        />
        <UButton to="/profile" variant="link" color="primary" icon="i-lucide-eye">Choose what others see about you</UButton>
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
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  permission: { directory: ['view'] },
  layout: 'default',
})
useSeoMeta({ title: 'Members Directory | Lifegate Baptist Church' })

// Every entry is already filtered by the server for this viewer.
const { data, error } = await useFetch('/api/directory')

const search = ref('')

// Speakers include guest speakers, who are not church members.
const tab = ref<'members' | 'speakers'>('members')
const tabs = [
  { label: 'Members', value: 'members', icon: 'i-lucide-users' },
  { label: 'Speakers', value: 'speakers', icon: 'i-lucide-mic' },
]

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
