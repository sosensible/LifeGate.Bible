<template>
  <div class="space-y-8">
    <section class="space-y-3">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="font-serif text-2xl font-bold text-highlighted">{{ monthLabel(month) }}</h2>
          <p class="text-toned text-sm">What is due, and what has already been paid, entered or skipped.</p>
        </div>
        <UFieldGroup>
          <UButton color="neutral" variant="outline" icon="i-lucide-chevron-left" aria-label="Previous month" @click="month = addMonths(month, -1)" />
          <UButton color="neutral" variant="outline" class="min-w-40 justify-center" @click="month = currentMonth()">{{ monthLabel(month) }}</UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-chevron-right" aria-label="Next month" @click="month = addMonths(month, 1)" />
        </UFieldGroup>
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <UTable :data="occurrences" :columns="occurrenceColumns" :loading="upcomingStatus === 'pending'" :empty="`Nothing recurring in ${monthLabel(month)}.`">
          <template #dueOn-cell="{ row }">
            <span class="whitespace-nowrap text-toned">{{ formatDueDate(row.original.dueOn) }}</span>
          </template>
          <template #name-cell="{ row }">
            <UUser :name="row.original.name" :description="[row.original.categoryName ?? 'Reminder', row.original.accountName].filter(Boolean).join(' · ')" />
          </template>
          <template #amount-cell="{ row }">
            <span class="tabular-nums" :class="row.original.amountCents > 0 ? 'text-success' : 'text-highlighted'">{{ formatCents(row.original.amountCents) }}</span>
          </template>
          <template #status-cell="{ row }">
            <UBadge variant="subtle" :color="OCCURRENCE_BADGES[row.original.status].color">{{ OCCURRENCE_BADGES[row.original.status].label }}</UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton
                v-if="row.original.transactionId"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-external-link"
                :to="{ path: '/admin/stewardship/transactions', query: { transactionId: row.original.transactionId, month: row.original.dueOn.slice(0, 7) } }"
              >
                Open
              </UButton>
              <UButton
                v-if="canManage && (row.original.status === 'open' || row.original.status === 'overdue')"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-forward"
                :loading="skipping === `${row.original.recurringId}|${row.original.dueOn}`"
                @click="skip(row.original)"
              >
                Skip
              </UButton>
            </div>
          </template>
        </UTable>
      </UCard>
    </section>

    <section class="space-y-3">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <h2 class="font-serif text-2xl font-bold text-highlighted">Recurring transactions</h2>
        <USwitch v-model="showArchived" label="Show archived" />
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <UTable :data="items" :columns="itemColumns" empty="Nothing recurring yet.">
          <template #name-cell="{ row }">
            <UUser :name="row.original.name" :description="[row.original.categoryName ?? 'Reminder only', row.original.accountName].filter(Boolean).join(' · ')" />
          </template>
          <template #amount-cell="{ row }">
            <span class="tabular-nums" :class="row.original.amountCents > 0 ? 'text-success' : 'text-highlighted'">
              {{ row.original.amountVaries ? '≈ ' : '' }}{{ formatCents(row.original.amountCents) }}
            </span>
          </template>
          <template #schedule-cell="{ row }">
            <span class="text-toned">{{ RECURRING_FREQUENCY_LABELS[row.original.frequency] }}</span>
            <span class="block text-xs text-muted">{{ row.original.archivedAt ? 'Archived' : row.original.nextDueOn ? `Next ${formatDueDate(row.original.nextDueOn)}` : 'Ended' }}</span>
          </template>
          <template #uses-cell="{ row }">
            <div class="flex flex-wrap gap-1">
              <UBadge v-if="row.original.feedsPlan" variant="subtle" color="primary" icon="i-lucide-target">Plan</UBadge>
              <UBadge v-if="row.original.matchBank" variant="subtle" color="info" icon="i-lucide-link">Matches bank</UBadge>
              <UBadge v-if="row.original.autoEnter" variant="subtle" color="success" icon="i-lucide-repeat">Enters</UBadge>
              <UBadge v-if="!row.original.feedsPlan && !row.original.matchBank && !row.original.autoEnter" variant="subtle" color="neutral" icon="i-lucide-bell">Reminder</UBadge>
            </div>
          </template>
          <template #actions-cell="{ row }">
            <UButton v-if="canManage" size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${row.original.name}`" @click="$emit('edit', row.original)" />
          </template>
        </UTable>
      </UCard>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import { addMonths, currentMonth, monthLabel, RECURRING_FREQUENCY_LABELS, type RecurringView, type UpcomingOccurrence } from '#shared/stewardship'

defineEmits<{ edit: [item: RecurringView] }>()

const auth = useAuthStore()
const toast = useToast()
const canManage = computed(() => auth.can({ stewardship: ['manage'] }))

const month = ref(currentMonth())
const { data: upcomingData, status: upcomingStatus, refresh: refreshUpcoming } = useFetch('/api/admin/stewardship/recurring/upcoming', {
  query: computed(() => ({ month: month.value })),
  lazy: true,
  server: false,
})
const { data: itemData, refresh: refreshItems } = useFetch('/api/admin/stewardship/recurring', { lazy: true, server: false })

const occurrences = computed<UpcomingOccurrence[]>(() => upcomingData.value?.occurrences ?? [])
const showArchived = ref(false)
const items = computed<RecurringView[]>(() => (itemData.value?.recurring ?? []).filter(i => showArchived.value || !i.archivedAt))

const occurrenceColumns: TableColumn<UpcomingOccurrence>[] = [
  { id: 'dueOn', header: 'Due' },
  { id: 'name', header: 'Name' },
  { id: 'amount', header: 'Amount', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { id: 'status', header: 'Status' },
  { id: 'actions', header: '' },
]
const itemColumns: TableColumn<RecurringView>[] = [
  { id: 'name', header: 'Name' },
  { id: 'amount', header: 'Amount', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { id: 'schedule', header: 'Schedule' },
  { id: 'uses', header: 'Uses' },
  { id: 'actions', header: '' },
]

const skipping = ref<string | null>(null)
const skip = async (occurrence: UpcomingOccurrence) => {
  skipping.value = `${occurrence.recurringId}|${occurrence.dueOn}`
  try {
    await $fetch(`/api/admin/stewardship/recurring/${occurrence.recurringId}/skip`, { method: 'POST', body: { dueOn: occurrence.dueOn } })
    await refreshUpcoming()
  }
  catch (err) {
    toast.add({ title: 'Not skipped', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    skipping.value = null
  }
}

const refresh = () => Promise.all([refreshItems(), refreshUpcoming()])
defineExpose({ refresh })
</script>
