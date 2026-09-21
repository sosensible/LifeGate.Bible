<template>
  <div>
    <AdminStewardshipHeader title="Givers">
      <div class="flex flex-wrap gap-2">
        <UButton to="/help/giving-records" variant="outline" class="text-white ring-white/40 hover:bg-white/10" icon="i-lucide-circle-question-mark">Help</UButton>
        <UButton v-if="canManage" color="secondary" icon="i-lucide-plus" @click="openGiver(null)">Add giving record</UButton>
      </div>
    </AdminStewardshipHeader>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-6">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Giving records could not be loaded.')" />

        <UAlert
          v-if="incomplete"
          color="warning"
          variant="subtle"
          icon="i-lucide-mail-warning"
          :title="`${incomplete} giving record${incomplete === 1 ? '' : 's'} can’t receive a statement yet`"
          description="They need a mailing address, or an email if statements go by email."
        />

        <div class="flex flex-wrap items-end gap-3">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search names..." class="w-full sm:w-64" />
          <USelect v-model="year" :items="yearItems" class="w-32" aria-label="Year for totals" />
          <USwitch v-model="showArchived" label="Show archived" class="ml-auto" />
        </div>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <UTable
            :data="visible"
            :columns="columns"
            :loading="status === 'pending'"
            empty="No giving records."
            :ui="{ tr: 'cursor-pointer' }"
            @select="(_e: Event, row: TableRow<GiverView>) => openGiver(row.original.id)"
          >
            <template #name-cell="{ row }">
              <UUser :name="row.original.statementName" :description="row.original.householdName ?? row.original.personName ?? 'Not linked to the directory'" />
              <UBadge v-if="row.original.archivedAt" color="neutral" variant="subtle" class="ml-2">Archived</UBadge>
            </template>
            <template #delivery-cell="{ row }">
              <UBadge variant="subtle" :color="ready(row.original) ? 'neutral' : 'warning'" :icon="row.original.delivery === 'email' ? 'i-lucide-mail' : 'i-lucide-mailbox'">
                {{ row.original.delivery === 'email' ? 'Email' : 'Mail' }}{{ ready(row.original) ? '' : ' · missing details' }}
              </UBadge>
            </template>
            <template #total-cell="{ row }">
              <span class="tabular-nums">{{ formatCents(row.original.yearTotalCents) }}</span>
            </template>
          </UTable>
        </UCard>
      </div>
    </div>

    <AdminGiverSlideover v-model:open="editorOpen" :giver-id="editingId" :year="year" @saved="refresh" />
  </div>
</template>

<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import type { GiverView } from '#shared/giving'

definePageMeta({
  middleware: 'auth',
  permission: { giving: ['view'] },
  layout: 'default',
})
useSeoMeta({ title: 'Givers | Lifegate Baptist Church' })

const auth = useAuthStore()
const canManage = computed(() => auth.can({ giving: ['manage'] }))

const yearItems = recentYearItems()
const year = ref(new Date().getFullYear())
const { data, error, status, refresh } = await useFetch('/api/admin/giving/givers', { query: computed(() => ({ year: year.value })) })
const givers = computed<GiverView[]>(() => data.value?.givers ?? [])

const search = ref('')
const showArchived = ref(false)
const visible = computed(() => {
  const text = search.value.trim().toLowerCase()
  return givers.value.filter(g => (showArchived.value || !g.archivedAt) && (!text || g.statementName.toLowerCase().includes(text)))
})

// Can a statement reach them the way they chose?
const ready = (giver: GiverView) => giver.delivery === 'email' ? Boolean(giver.email) : Boolean(giver.mailingAddress?.trim())
const incomplete = computed(() => givers.value.filter(g => !g.archivedAt && !ready(g)).length)

const columns = computed<TableColumn<GiverView>[]>(() => [
  { id: 'name', header: 'Giving record' },
  { id: 'delivery', header: 'Statements by' },
  { id: 'total', header: `Given in ${year.value}`, meta: { class: { th: 'text-right', td: 'text-right' } } },
])

const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const openGiver = (id: string | null) => {
  editingId.value = id
  editorOpen.value = true
}
</script>
