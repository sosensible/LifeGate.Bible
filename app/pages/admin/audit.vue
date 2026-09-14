<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Church Office</p>
        <h1 class="text-4xl font-bold font-serif text-white">Audit Log</h1>
        <p class="text-white/70 mt-2 max-w-2xl">Who changed what, and when. Entries record which fields changed, never the personal details themselves.</p>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <!-- Filters -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
          <USelect v-model="entityType" :items="entityTypeItems" placeholder="Everything" class="w-full" />
          <USelectMenu v-model="action" :items="actionItems" value-key="value" placeholder="Any action" clear class="w-full" />
          <USelectMenu v-model="actorId" :items="actorItems" value-key="value" placeholder="Anyone" clear class="w-full" />
          <UInput v-model="from" type="date" aria-label="From date" class="w-full" />
          <UInput v-model="to" type="date" aria-label="To date" class="w-full" />
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
          <USwitch v-model="hideSignIns" label="Hide sign-ins" />
          <div class="flex items-center gap-3">
            <p class="text-muted text-sm">{{ total }} {{ total === 1 ? 'entry' : 'entries' }}</p>
            <UButton v-if="hasFilters" size="xs" variant="link" color="neutral" @click="clearFilters">Clear filters</UButton>
          </div>
        </div>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'The audit log could not be loaded.')" />

        <div v-else class="bg-elevated rounded-lg border border-default overflow-x-auto">
          <UTable :data="entries" :columns="columns" :loading="status === 'pending'" empty="Nothing matches these filters.">
            <template #when-cell="{ row }">
              <span class="text-toned text-xs whitespace-nowrap" :title="formatDateTime(row.original.at)">{{ formatDateTime(row.original.at) }}</span>
            </template>
            <template #who-cell="{ row }">
              <span class="text-toned text-xs">{{ row.original.actor?.label ?? 'Deleted account' }}</span>
            </template>
            <template #what-cell="{ row }">
              <span class="font-bold text-highlighted text-sm">{{ actionLabel(row.original.action) }}</span>
            </template>
            <template #item-cell="{ row }">
              <span class="text-xs">
                <span class="text-muted">{{ ENTITY_TYPE_LABELS[row.original.entityType] ?? row.original.entityType }}: </span>
                <span v-if="row.original.entityLabel" class="text-toned">{{ row.original.entityLabel }}</span>
                <span v-else class="text-muted italic" :title="row.original.entityId ?? undefined">no longer exists</span>
              </span>
            </template>
            <template #details-cell="{ row }">
              <div class="text-xs text-toned max-w-xs">
                <p v-if="row.original.fields.length">{{ row.original.fields.map(humanizeField).join(', ') }}</p>
                <p v-if="row.original.note" class="text-muted">{{ row.original.note }}</p>
              </div>
            </template>
          </UTable>
        </div>

        <div v-if="total > pageSize" class="flex justify-center mt-6">
          <UPagination v-model:page="page" :total="total" :items-per-page="pageSize" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { actionLabel, ENTITY_TYPE_LABELS, type AuditEntryView } from '#shared/audit'

definePageMeta({
  middleware: 'auth',
  permission: { audit: ['view'] },
  layout: 'default',
})
useSeoMeta({ title: 'Audit Log | Lifegate Baptist Church' })

const pageSize = 50
const page = ref(1)
const entityType = ref<string | undefined>()
const action = ref<string | undefined>()
const actorId = ref<string | undefined>()
const from = ref('')
const to = ref('')
const hideSignIns = ref(true)

// Changing any filter goes back to the first page.
watch([entityType, action, actorId, from, to, hideSignIns], () => { page.value = 1 })

const query = computed(() => ({
  page: page.value,
  pageSize,
  entityType: entityType.value || undefined,
  action: action.value || undefined,
  actorId: actorId.value || undefined,
  from: from.value || undefined,
  to: to.value || undefined,
  hideSignIns: String(hideSignIns.value),
}))

const { data, error, status } = await useFetch('/api/admin/audit', { query })

const entries = computed<AuditEntryView[]>(() => data.value?.entries ?? [])
const total = computed(() => data.value?.total ?? 0)

const entityTypeItems = computed(() => (data.value?.options.entityTypes ?? []).map(value => ({ value, label: ENTITY_TYPE_LABELS[value] ?? value })))
const actionItems = computed(() => (data.value?.options.actions ?? []).map(value => ({ value, label: actionLabel(value) })))
const actorItems = computed(() => (data.value?.options.actors ?? []).map(actor => ({ value: actor.id, label: actor.label })))

const hasFilters = computed(() => Boolean(entityType.value || action.value || actorId.value || from.value || to.value))
const clearFilters = () => {
  entityType.value = undefined
  action.value = undefined
  actorId.value = undefined
  from.value = ''
  to.value = ''
}

const columns: TableColumn<AuditEntryView>[] = [
  { id: 'when', header: 'When' },
  { id: 'who', header: 'Who' },
  { id: 'what', header: 'What' },
  { id: 'item', header: 'Item' },
  { id: 'details', header: 'Details' },
]
</script>
