<template>
  <div>
    <AdminStewardshipHeader title="Offerings">
      <UButton v-if="canRecord" color="secondary" icon="i-lucide-plus" @click="startOpen = true">Start a count</UButton>
    </AdminStewardshipHeader>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-8">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Counts could not be loaded.')" />

        <section class="space-y-3">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 class="font-serif text-2xl font-bold text-highlighted">{{ canView ? 'Counts' : 'Open counts' }}</h2>
              <p class="text-toned text-sm max-w-2xl">
                <template v-if="canView">Each count is one offering, entered gift by gift. Close it when it matches the count sheet, then link its bank deposit: undesignated giving goes to Available to Fund, designated gifts to their budget categories.</template>
                <template v-else>Enter gifts in a count that is still open. Once the Treasurer closes it, it leaves this list.</template>
              </p>
            </div>
            <USelect v-if="canView" v-model="year" :items="yearItems" class="w-32" aria-label="Year" />
          </div>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <UTable
              :data="counts"
              :columns="columns"
              :loading="status === 'pending'"
              :empty="canView ? 'No counts this year.' : 'No open counts. Start one to enter gifts.'"
              :ui="{ tr: 'cursor-pointer' }"
              @select="(_e: Event, row: TableRow<CountSummary>) => navigateTo(`/admin/stewardship/offerings/${row.original.id}`)"
            >
              <template #date-cell="{ row }">
                <span class="text-highlighted font-semibold whitespace-nowrap">{{ countTitle(row.original) }}</span>
              </template>
              <template #status-cell="{ row }">
                <UBadge :color="row.original.status === 'open' ? 'warning' : 'success'" variant="subtle">{{ row.original.status === 'open' ? 'Open' : 'Closed' }}</UBadge>
              </template>
              <template #total-cell="{ row }">
                <span class="tabular-nums">{{ formatCents(row.original.totalCents ?? 0) }}</span>
              </template>
              <template #deposit-cell="{ row }">
                <UBadge v-if="row.original.depositLinked" color="success" variant="subtle" icon="i-lucide-landmark">Deposited</UBadge>
                <UBadge v-else-if="row.original.status === 'closed'" color="neutral" variant="subtle">No deposit yet</UBadge>
              </template>
            </UTable>
          </UCard>
        </section>
      </div>
    </div>

    <AdminCountDetailsModal v-model:open="startOpen" @saved="(id: string) => navigateTo(`/admin/stewardship/offerings/${id}`)" />
  </div>
</template>

<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import type { CountSummary } from '#shared/giving'

definePageMeta({
  middleware: 'auth',
  permission: { giving: ['record'] },
  layout: 'default',
})
useSeoMeta({ title: 'Offerings | Lifegate Baptist Church' })

const auth = useAuthStore()
const canRecord = computed(() => auth.can({ giving: ['record'] }))
const canView = computed(() => auth.can({ giving: ['view'] }))

const yearItems = recentYearItems()
const year = ref(new Date().getFullYear())
const startOpen = ref(false)

const { data, error, status } = await useFetch('/api/admin/giving/counts', { query: computed(() => ({ year: year.value })) })
const counts = computed<CountSummary[]>(() => data.value?.counts ?? [])

const columns = computed<TableColumn<CountSummary>[]>(() => [
  { id: 'date', header: 'Count' },
  { id: 'status', header: 'Status' },
  { accessorKey: 'giftCount', header: 'Gifts' },
  ...(canView.value
    ? [
        { id: 'total', header: 'Total', meta: { class: { th: 'text-right', td: 'text-right' } } },
        { id: 'deposit', header: 'Deposit' },
      ]
    : []),
])
</script>
