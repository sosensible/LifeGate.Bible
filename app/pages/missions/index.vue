<template>
  <div>
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Area</p>
          <h1 class="text-4xl font-bold font-serif text-white">Missions</h1>
          <p class="text-white/70 mt-2 max-w-2xl">The missionaries and organizations Lifegate supports. Please keep these details within the church family.</p>
        </div>
        <div v-if="data?.canEdit" class="flex flex-wrap gap-2">
          <UButton icon="i-lucide-plus" color="secondary" @click="editMissionary(null)">Add missionary</UButton>
          <UButton icon="i-lucide-plus" variant="outline" class="text-white ring-white/40 hover:bg-white/10" @click="editOrganization(null)">Add organization</UButton>
        </div>
      </div>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" description="Missions could not be loaded. Please try again." class="max-w-6xl mx-auto my-8" />

    <template v-else-if="data">
      <!-- Missionaries -->
      <div class="bg-default py-10 px-6">
        <div class="max-w-6xl mx-auto">
          <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h2 class="text-2xl font-bold font-serif text-highlighted">Missionaries</h2>
            <UInput v-if="data.missionaries.length > 6" v-model="search" icon="i-lucide-search" placeholder="Search name, field or organization..." class="w-full max-w-sm" />
          </div>

          <div v-if="data.missionaries.length === 0" class="bg-muted border border-default rounded-lg p-8 text-center">
            <p class="text-toned">No missionaries have been added yet.</p>
          </div>
          <p v-else-if="filtered.length === 0" class="text-muted text-center py-10">No missionaries match "{{ search }}".</p>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <MissionsMissionaryCard v-for="missionary in filtered" :key="missionary.id" :missionary="missionary" />
          </div>
        </div>
      </div>

      <!-- Organizations -->
      <div v-if="data.organizations.length" class="bg-muted border-t border-default py-10 px-6">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-2xl font-bold font-serif text-highlighted mb-6">Mission Organizations</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <NuxtLink
              v-for="organization in data.organizations"
              :key="organization.id"
              :to="`/missions/organizations/${organization.slug}`"
              class="bg-elevated rounded-lg border border-default shadow-sm p-5 flex gap-4 items-center hover:border-primary transition-colors group"
            >
              <img v-if="organization.photoUrl" :src="organization.photoUrl" :alt="organization.name" class="w-14 h-14 rounded-md object-cover shrink-0">
              <div v-else class="w-14 h-14 rounded-md bg-primary-800 flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-globe" class="w-6 h-6 text-gold-400" />
              </div>
              <div class="min-w-0">
                <h3 class="font-serif font-bold text-highlighted leading-tight group-hover:text-primary transition-colors">{{ organization.name }}</h3>
                <p v-if="organization.relationship" class="text-muted text-xs">{{ organization.relationship }}</p>
                <p class="text-muted text-xs">{{ organization.missionaryCount }} {{ organization.missionaryCount === 1 ? 'missionary' : 'missionaries' }}</p>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Archive: staff and admins -->
      <div v-if="data.archived" class="bg-default border-t border-default py-8 px-6">
        <div class="max-w-6xl mx-auto">
          <LazyArchiveAccordion :sections="archiveSections" @changed="refresh()" />
        </div>
      </div>
    </template>

    <template v-if="data?.canEdit">
      <LazyMissionsMissionarySlideover v-model:open="missionaryOpen" :missionary="editingMissionary" :organizations="data.organizations" @saved="onMissionarySaved" />
      <LazyMissionsOrganizationSlideover v-model:open="organizationOpen" :organization="editingOrganization" @saved="refresh()" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { MissionaryView, OrganizationView } from '#shared/missions'
import type { ArchiveSection } from '~/components/ArchiveAccordion.vue'

definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
// Missionaries in some countries are put at risk by being findable online.
useSeoMeta({ title: 'Missions | Lifegate Baptist Church', robots: 'noindex, nofollow' })

const { data, error, refresh } = await useFetch('/api/missions')

const search = ref('')
const filtered = computed(() => {
  const list = data.value?.missionaries ?? []
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(m => [m.name, m.familyNames, m.field, m.focus, m.organization?.name]
    .some(value => value?.toLowerCase().includes(q)))
})

const missionaryOpen = ref(false)
const editingMissionary = ref<MissionaryView | null>(null)
const editMissionary = (missionary: MissionaryView | null) => {
  editingMissionary.value = missionary
  missionaryOpen.value = true
}
const onMissionarySaved = (missionary: MissionaryView) => navigateTo(`/missions/${missionary.slug}`)

const archiveSections = computed<ArchiveSection[]>(() => [
  {
    label: 'Missionaries',
    items: (data.value?.archived?.missionaries ?? []).map(m => ({ id: m.id, name: m.name, detail: m.field, archivedAt: m.archivedAt!, to: `/missions/${m.slug}` })),
    base: item => `/api/missions/missionaries/${item.id}`,
    removeWarning: item => `${item.name}, their photo, prayer requests and letters will be deleted. This cannot be undone.`,
  },
  {
    label: 'Organizations',
    items: (data.value?.archived?.organizations ?? []).map(o => ({ id: o.id, name: o.name, detail: o.relationship, archivedAt: o.archivedAt!, to: `/missions/organizations/${o.slug}` })),
    base: item => `/api/missions/organizations/${item.id}`,
    removeWarning: item => `${item.name} will be deleted. Missionaries who serve with it are kept, with no organization. This cannot be undone.`,
  },
])

const organizationOpen = ref(false)
const editingOrganization = ref<OrganizationView | null>(null)
const editOrganization = (organization: OrganizationView | null) => {
  editingOrganization.value = organization
  organizationOpen.value = true
}
</script>
