<template>
  <UTable
    :data="rows"
    :columns="columns"
    :loading="status === 'pending'"
    :empty="`No ${categoryName} transactions in ${monthLabel(month)}.`"
    :ui="{ tr: 'cursor-pointer' }"
    @select="(_event: Event, row: TableRow<Row>) => emit('select', row.original.id)"
  >
    <template #amount-cell="{ row }">
      <span class="tabular-nums" :class="row.original.amountCents > 0 ? 'text-success' : 'text-highlighted'">{{ formatCents(row.original.amountCents) }}</span>
    </template>
  </UTable>
  <p v-if="total > rows.length" class="text-muted text-xs mt-2">Showing the latest {{ rows.length }} of {{ total }}.</p>

  <section v-if="bills.length" class="mt-6 space-y-2">
    <h3 class="font-serif text-base font-bold text-highlighted">Recurring in {{ monthLabel(month) }}</h3>
    <UTable :data="bills" :columns="billColumns">
      <template #dueOn-cell="{ row }">
        <span class="whitespace-nowrap text-toned">{{ formatDueDate(row.original.dueOn) }}</span>
      </template>
      <template #amount-cell="{ row }">
        <span class="tabular-nums">{{ formatCents(row.original.amountCents) }}</span>
      </template>
      <template #status-cell="{ row }">
        <UBadge variant="subtle" :color="OCCURRENCE_BADGES[row.original.status].color">{{ OCCURRENCE_BADGES[row.original.status].label }}</UBadge>
      </template>
    </UTable>
  </section>
</template>

<script setup lang="ts">
// The transactions that make up one category's Activity for one month.
import type { TableColumn, TableRow } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import { monthLabel, type UpcomingOccurrence } from '#shared/stewardship'

const props = defineProps<{ categoryId: string, categoryName: string, month: string }>()
const emit = defineEmits<{ select: [transactionId: string] }>()

const { data, status } = useFetch('/api/admin/stewardship/transactions', {
  query: computed(() => ({ categoryId: props.categoryId, month: props.month, pageSize: 200 })),
  lazy: true,
  server: false,
})

interface Row { id: string, postedOn: string, payee: string, account: string, amountCents: number }

// A split transaction counts only its lines in this category.
const rows = computed<Row[]>(() => (data.value?.transactions ?? []).map(t => ({
  id: t.id,
  postedOn: t.postedOn,
  payee: t.payee || t.bankDescription || 'No payee',
  account: t.accountName,
  amountCents: t.splits.filter(s => s.categoryId === props.categoryId).reduce((sum, s) => sum + s.amountCents, 0),
})))
const total = computed(() => data.value?.total ?? 0)

// This category's recurring bills due this month, and whether each has been seen.
const { data: upcomingData } = useFetch('/api/admin/stewardship/recurring/upcoming', {
  query: computed(() => ({ month: props.month, categoryId: props.categoryId })),
  lazy: true,
  server: false,
})
const bills = computed<UpcomingOccurrence[]>(() => upcomingData.value?.occurrences ?? [])
const billColumns: TableColumn<UpcomingOccurrence>[] = [
  { id: 'dueOn', header: 'Due' },
  { accessorKey: 'name', header: 'Name' },
  { id: 'amount', header: 'Amount', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { id: 'status', header: 'Status' },
]

const columns: TableColumn<Row>[] = [
  { accessorKey: 'postedOn', header: 'Date' },
  { accessorKey: 'payee', header: 'Payee' },
  { accessorKey: 'account', header: 'Account' },
  { id: 'amount', header: 'Amount', meta: { class: { th: 'text-right', td: 'text-right' } } },
]
</script>
