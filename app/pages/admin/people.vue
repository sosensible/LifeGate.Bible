<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Church Office</p>
          <h1 class="text-4xl font-bold font-serif text-white">People</h1>
        </div>
        <UButton v-if="canCreate" color="secondary" icon="i-lucide-user-plus" @click="openEditor(null)">Add person</UButton>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-12">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'People could not be loaded.')" />

        <!-- People -->
        <section v-else>
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <UInput v-model="search" icon="i-lucide-search" placeholder="Search by name, email, household or ministry..." class="w-full max-w-md" />
            <p class="text-muted text-sm">{{ filtered.length }} of {{ people.length }}</p>
          </div>

          <div class="bg-elevated rounded-lg border border-default overflow-x-auto">
            <UTable :data="filtered" :columns="columns" :empty="people.length ? 'Nobody matches that search.' : 'No people yet. Add the first one.'">
              <template #name-cell="{ row }">
                <button type="button" class="flex items-center gap-3 text-left group" @click="openEditor(row.original)">
                  <span class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold" :style="{ backgroundColor: avatarColor(row.original.id) }">{{ initialsOf(row.original) }}</span>
                  <span>
                    <span class="block font-bold text-highlighted group-hover:text-primary">{{ row.original.lastName }}, {{ row.original.firstName }}</span>
                    <span class="flex items-center gap-1.5 text-muted text-xs">
                      <span v-if="row.original.title">{{ row.original.title }}</span>
                      <UBadge v-if="row.original.isMinor" size="sm" variant="subtle" color="warning">Minor</UBadge>
                    </span>
                  </span>
                </button>
              </template>
              <template #household-cell="{ row }">
                <span class="text-toned">{{ row.original.householdName ?? '—' }}</span>
              </template>
              <template #contact-cell="{ row }">
                <div class="text-xs text-toned">
                  <p>{{ row.original.phone ?? '—' }}</p>
                  <p class="break-all">{{ row.original.email }}</p>
                </div>
              </template>
              <template #ministries-cell="{ row }">
                <span class="text-xs text-toned">{{ row.original.ministries.map(m => m.name).join(', ') || '—' }}</span>
              </template>
              <template #access-cell="{ row }">
                <UBadge v-if="row.original.account" variant="subtle" color="primary" icon="i-lucide-key-round">Signs in</UBadge>
                <span v-else class="text-muted text-xs">No sign-in</span>
              </template>
              <template #actions-cell="{ row }">
                <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${fullName(row.original)}`" @click="openEditor(row.original)" />
              </template>
            </UTable>
          </div>
        </section>

        <!-- Households -->
        <section>
          <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h2 class="font-serif text-2xl font-bold text-highlighted mb-1">Households</h2>
              <p class="text-toned text-sm">Who runs the house (a married couple, a single parent or guardian, or two guardians), and their children. Listed by last name. Removing a household keeps its people.</p>
            </div>
            <UButton variant="outline" icon="i-lucide-house-plus" @click="openHousehold(null)">Add household</UButton>
          </div>
          <ul class="bg-elevated rounded-lg border border-default divide-y divide-default">
            <li v-if="!households.length" class="p-4 text-muted text-sm">No households yet.</li>
            <li v-for="household in households" :key="household.id" class="p-4 flex flex-wrap items-center justify-between gap-3">
              <button type="button" class="text-left group flex-1 min-w-60" @click="openHousehold(household)">
                <span class="flex items-center gap-2">
                  <span class="font-bold text-highlighted group-hover:text-primary">{{ household.name }}</span>
                  <UBadge v-if="household.problems.length" size="sm" variant="subtle" color="warning" icon="i-lucide-triangle-alert">Needs setup</UBadge>
                </span>
                <span class="block text-muted text-xs mt-0.5">
                  {{ householdSummary(household.kind, household.relationship, household.adults) }}
                  <template v-if="childCount(household)"> · {{ childCount(household) }} {{ childCount(household) === 1 ? 'child' : 'children' }}</template>
                </span>
              </button>
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" :aria-label="`Edit ${household.name}`" @click="openHousehold(household)" />
            </li>
          </ul>
        </section>
      </div>
    </div>

    <AdminPersonSlideover
      v-model:open="editorOpen"
      :person="editing"
      :ministries="ministries"
      @saved="onSaved"
      @removed="onRemoved"
    />

    <AdminHouseholdSlideover
      v-model:open="householdOpen"
      :household="editingHousehold"
      :people="people"
      @saved="onHouseholdChanged"
      @removed="onHouseholdChanged"
    />
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { householdSummary, type HouseholdView } from '#shared/households'
import type { AdminPersonView } from '#shared/people'

definePageMeta({
  middleware: 'auth',
  permission: { people: ['update'] },
  layout: 'default',
})
useSeoMeta({ title: 'People | Lifegate Baptist Church' })

const auth = useAuthStore()
const canCreate = computed(() => auth.can({ people: ['create'] }))

const [{ data: peopleData, error, refresh: refreshPeople }, { data: householdData, refresh: refreshHouseholds }, { data: ministryData }] = await Promise.all([
  useFetch('/api/admin/people'),
  useFetch('/api/admin/households'),
  useFetch('/api/ministries'),
])

const people = ref<AdminPersonView[]>(peopleData.value?.people ?? [])
const households = ref<HouseholdView[]>(householdData.value?.households ?? [])
const ministries = computed(() => (ministryData.value ?? []).map(({ id, name }) => ({ id, name })))

watch(peopleData, value => people.value = value?.people ?? [])
watch(householdData, value => households.value = value?.households ?? [])

const columns: TableColumn<AdminPersonView>[] = [
  { id: 'name', header: 'Name' },
  { id: 'household', header: 'Household' },
  { id: 'contact', header: 'Contact' },
  { id: 'ministries', header: 'Ministries' },
  { id: 'access', header: 'Sign-in' },
  { id: 'actions', header: '' },
]

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return people.value
  return people.value.filter(p =>
    [fullName(p), p.email, p.householdName, p.title, ...p.ministries.map(m => m.name)]
      .some(value => value?.toLowerCase().includes(q)),
  )
})

const editorOpen = ref(false)
const editing = ref<AdminPersonView | null>(null)
const openEditor = (person: AdminPersonView | null) => {
  editing.value = person
  editorOpen.value = true
}

const byName = (a: AdminPersonView, b: AdminPersonView) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)

const onSaved = (saved: AdminPersonView) => {
  const others = people.value.filter(p => p.id !== saved.id)
  people.value = [...others, saved].sort(byName)
  if (editing.value?.id === saved.id) editing.value = saved
  refreshHouseholds()
}

const onRemoved = (id: string) => {
  people.value = people.value.filter(p => p.id !== id)
  editing.value = null
  refreshHouseholds()
}

// Households
const householdOpen = ref(false)
const editingHousehold = ref<HouseholdView | null>(null)
const openHousehold = (household: HouseholdView | null) => {
  editingHousehold.value = household
  householdOpen.value = true
}

// People without a role yet (older households) are not counted as children.
const childCount = (household: HouseholdView) => household.children.filter(c => c.role === 'child').length

// Saving or removing a household changes people's household and role too.
const onHouseholdChanged = async () => {
  await Promise.all([refreshHouseholds(), refreshPeople()])
}
</script>
