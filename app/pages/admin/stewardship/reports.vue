<template>
  <div>
    <AdminStewardshipHeader title="Reports">
      <div v-if="report" class="flex flex-wrap gap-2">
        <UButton variant="outline" class="text-white ring-white/40 hover:bg-white/10" icon="i-lucide-file-text" :to="`${base}/pdf`" target="_blank" external>PDF</UButton>
        <UDropdownMenu :items="csvItems" :content="{ align: 'end' }">
          <UButton color="secondary" icon="i-lucide-sheet" trailing-icon="i-lucide-chevron-down">CSV</UButton>
        </UDropdownMenu>
      </div>
    </AdminStewardshipHeader>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-8">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 class="font-serif text-2xl font-bold text-highlighted">{{ report?.label ?? 'Semi-annual report' }}</h2>
            <p class="text-toned text-sm max-w-2xl">Each category group’s funding, activity and what is left for the half-year, with the church’s cash from start to end.</p>
          </div>
          <USelect v-model="periodKey" :items="periodItems" class="w-56" aria-label="Period" />
        </div>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'The report could not be loaded.')" />

        <template v-if="report">
          <UAlert v-if="report.toDate" color="info" variant="subtle" icon="i-lucide-calendar-clock" title="To date" description="This half-year isn’t over, so these figures will change." />
          <UAlert
            v-if="report.uncategorizedCount"
            color="warning"
            variant="subtle"
            icon="i-lucide-tags"
            :title="`${report.uncategorizedCount} transaction${report.uncategorizedCount === 1 ? '' : 's'} in this period ${report.uncategorizedCount === 1 ? 'isn’t' : 'aren’t'} categorized yet`"
            description="They are counted in cash but not in any category."
            :actions="[{ label: 'Categorize', to: { path: '/admin/stewardship/transactions', query: { categoryId: 'uncategorized' } }, color: 'warning', variant: 'outline' }]"
          />

          <!-- Cash -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <UCard v-for="card in cashCards" :key="card.label">
              <p class="text-xs font-bold tracking-wider uppercase text-muted">{{ card.label }}</p>
              <p class="text-3xl font-bold tabular-nums mt-1 text-highlighted">{{ formatCents(card.cents) }}</p>
              <p class="text-muted text-xs mt-1">{{ card.note }}</p>
            </UCard>
          </div>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <h2 class="font-serif text-xl font-bold text-highlighted">Cash</h2>
            </template>
            <UTable :data="summaryRows" :columns="summaryColumns" />
          </UCard>

          <!-- Category groups -->
          <UAlert v-if="!report.groups.length" color="neutral" variant="subtle" icon="i-lucide-folder-open" title="No category activity in this period" />
          <UCard v-for="group in report.groups" :key="group.id" :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="font-serif text-xl font-bold text-highlighted">{{ group.name }}</h2>
                <UBadge v-if="group.reportDetail === 'total'" color="neutral" variant="subtle" icon="i-lucide-sigma">Group total only</UBadge>
              </div>
            </template>
            <UTable v-if="group.reportDetail === 'total'" :data="[totalRow(`${group.name} total`, group.totals)]" :columns="columnsFor(group.name, group.totals, false)" />
            <UTable v-else :data="group.categories" :columns="columnsFor(group.name, group.totals)" :ui="{ tfoot: 'bg-elevated/50' }">
              <template #name-cell="{ row }">
                <span class="text-highlighted">{{ row.original.name }}</span>
                <UTooltip v-if="!row.original.rollover" text="Resets each month: what is left returns to Available to Fund">
                  <UIcon name="i-lucide-rotate-ccw" class="size-3.5 text-muted ml-1.5 align-middle" />
                </UTooltip>
                <UTooltip v-if="row.original.isSensitive" text="Sensitive: its transactions don’t show payees">
                  <UIcon name="i-lucide-shield" class="size-3.5 text-muted ml-1.5 align-middle" />
                </UTooltip>
              </template>
            </UTable>
          </UCard>

          <UCard v-if="report.groups.length" :ui="{ body: 'p-0 sm:p-0' }">
            <UTable :data="grandTotal" :columns="columnsFor('All categories', report.totals, false)" />
          </UCard>
          <p v-if="report.showReturned" class="text-muted text-xs">Returned: what categories that reset each month gave back to Available to Fund.</p>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { h } from 'vue'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import { currentMonth, reportPeriodLabel, type ReportPeriod, type ReportRow, type ReportTotals } from '#shared/stewardship'

definePageMeta({
  middleware: 'auth',
  permission: { stewardship: ['view'] },
  layout: 'default',
})
useSeoMeta({ title: 'Reports | Lifegate Baptist Church' })

// The current half and the five before it; the newest finished half by default.
const [thisYear, thisMonthNumber] = currentMonth().split('-').map(Number) as [number, number]
const current: ReportPeriod = { year: thisYear, half: thisMonthNumber <= 6 ? 1 : 2 }
const previous = (p: ReportPeriod): ReportPeriod => (p.half === 2 ? { year: p.year, half: 1 } : { year: p.year - 1, half: 2 })
const periods = [current]
for (let i = 0; i < 5; i++) periods.push(previous(periods.at(-1)!))
const keyOf = (p: ReportPeriod) => `${p.year}-${p.half}`
const periodItems = periods.map((p, i) => ({ value: keyOf(p), label: `${reportPeriodLabel(p)}${i === 0 ? ' (to date)' : ''}` }))
const periodKey = ref(keyOf(periods[1]!))
const base = computed(() => `/api/admin/stewardship/reports/${periodKey.value.replace('-', '/')}`)

const { data: report, error } = await useFetch(() => base.value)

const csvItems = computed<DropdownMenuItem[]>(() => [
  { label: 'Summary', description: 'Categories with month-by-month activity, and cash', icon: 'i-lucide-table', to: `${base.value}/csv`, target: '_blank', external: true },
  { label: 'With transactions', description: 'Every line; sensitive categories show no payee', icon: 'i-lucide-list', to: `${base.value}/csv?detail=transactions`, target: '_blank', external: true },
])

const cashCards = computed(() => {
  const s = report.value!.summary
  const moneyIn = s.undesignatedOfferingsCents + s.designatedOfferingsCents + s.otherInCents
  return [
    { label: 'Cash at start', cents: s.cashStartCents, note: 'Checking, savings and cash when the period began.' },
    { label: 'Money in', cents: moneyIn, note: 'Offerings and other income.' },
    { label: 'Money out', cents: s.outCents, note: 'Spending in every category.' },
    { label: 'Cash at end', cents: s.cashEndCents, note: report.value!.toDate ? 'So far.' : 'When the period ended.' },
  ]
})

interface SummaryRow { label: string, cents: number, total?: boolean }
const summaryRows = computed<SummaryRow[]>(() => {
  const s = report.value!.summary
  return [
    { label: 'Cash at start', cents: s.cashStartCents, total: true },
    { label: 'Undesignated offerings', cents: s.undesignatedOfferingsCents },
    { label: 'Designated offerings', cents: s.designatedOfferingsCents },
    { label: 'Other money in', cents: s.otherInCents },
    { label: 'Money out', cents: s.outCents },
    ...(s.transfersCents ? [{ label: 'Transfers to or from other accounts', cents: s.transfersCents }] : []),
    ...(s.uncategorizedCents ? [{ label: 'Not yet categorized', cents: s.uncategorizedCents }] : []),
    { label: 'Cash at end', cents: s.cashEndCents, total: true },
    { label: 'Available to Fund at start', cents: s.availableToFundStartCents },
    { label: 'Available to Fund at end', cents: s.availableToFundEndCents },
  ]
})

const amount = (cents: number, bold = false) =>
  h('span', { class: ['block text-right tabular-nums', bold ? 'font-semibold text-highlighted' : '', cents < 0 ? 'text-error' : ''] }, formatCents(cents))

const summaryColumns: TableColumn<SummaryRow>[] = [
  { id: 'label', header: 'Item', cell: ({ row }) => h('span', { class: row.original.total ? 'font-semibold text-highlighted' : 'text-toned' }, row.original.label) },
  { id: 'amount', header: () => h('span', { class: 'block text-right' }, 'Amount'), cell: ({ row }) => amount(row.original.cents, row.original.total) },
]

type MoneyKey = keyof Omit<ReportTotals, 'monthlyActivityCents'>
// The grand total, as one bold row under the same columns as the groups.
const totalRow = (name: string, totals: ReportTotals): ReportRow => ({ ...totals, id: `total-${name}`, name, isSensitive: false, rollover: true })
const grandTotal = computed<ReportRow[]>(() => report.value ? [totalRow('All categories total', report.value.totals)] : [])

const columnsFor = (totalLabel: string, totals: ReportTotals, withFooter = true): TableColumn<ReportRow>[] => {
  const money = (key: MoneyKey, label: string): TableColumn<ReportRow> => ({
    id: key,
    header: () => h('span', { class: 'block text-right' }, label),
    cell: ({ row }) => amount(row.original[key], !withFooter),
    ...(withFooter ? { footer: () => amount(totals[key], true) } : {}),
    meta: { class: { th: 'w-36', td: 'w-36' } },
  })
  return [
    { id: 'name', header: 'Category', cell: ({ row }) => h('span', { class: 'font-semibold text-highlighted' }, row.original.name), ...(withFooter ? { footer: () => h('span', { class: 'font-semibold text-highlighted' }, `${totalLabel} total`) } : {}) },
    money('carriedInCents', 'Carried in'),
    money('fundedCents', 'Funded'),
    money('activityCents', 'Activity'),
    ...(report.value?.showReturned ? [money('returnedCents', 'Returned')] : []),
    money('remainingCents', 'Remaining'),
  ]
}
</script>
