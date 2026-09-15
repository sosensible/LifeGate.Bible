<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-4">
        <div>
          <ULink to="/ministry-budget" class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase inline-flex items-center gap-1.5 hover:underline">
            <UIcon name="i-lucide-arrow-left" class="size-3.5" />
            Ministry budgets
          </ULink>
          <h1 class="text-4xl font-bold font-serif text-white mt-2">{{ budget?.ministry.name ?? 'Ministry budget' }}</h1>
        </div>
        <div class="flex items-center gap-2">
          <UButton icon="i-lucide-chevron-left" variant="outline" class="text-white ring-white/40 hover:bg-white/10" aria-label="Previous month" @click="month = addMonths(month, -1)" />
          <span class="text-white font-bold min-w-40 text-center">{{ monthLabel(month) }}</span>
          <UButton icon="i-lucide-chevron-right" variant="outline" class="text-white ring-white/40 hover:bg-white/10" aria-label="Next month" @click="month = addMonths(month, 1)" />
        </div>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-6">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'This budget could not be loaded.')" />

        <UCard v-for="category in budget?.categories ?? []" :key="category.id" :ui="{ body: category.ledger ? 'p-0 sm:p-0' : undefined }">
          <template #header>
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 class="font-serif text-xl font-bold text-highlighted">{{ category.name }}</h2>
                <p class="text-muted text-xs">{{ category.rollover ? 'What is left carries into next month.' : 'Starts fresh each month.' }}</p>
              </div>
              <dl class="grid grid-cols-3 gap-6 text-right">
                <div>
                  <dt class="text-xs uppercase tracking-wider text-muted font-bold">Funded</dt>
                  <dd class="tabular-nums font-semibold text-highlighted">{{ formatCents(category.fundedCents) }}</dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wider text-muted font-bold">Spent</dt>
                  <dd class="tabular-nums font-semibold text-highlighted">{{ formatCents(category.activityCents) }}</dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wider text-muted font-bold">Remaining</dt>
                  <dd>
                    <UBadge size="lg" variant="subtle" class="tabular-nums" :color="category.remainingCents < 0 ? 'error' : category.remainingCents > 0 ? 'success' : 'neutral'">
                      {{ formatCents(category.remainingCents) }}
                    </UBadge>
                  </dd>
                </div>
              </dl>
            </div>
          </template>

          <UTable v-if="category.ledger" :data="category.ledger" :columns="columns" empty="No spending this month.">
            <template #amount-cell="{ row }">
              <span class="tabular-nums" :class="row.original.amountCents > 0 ? 'text-success' : 'text-highlighted'">{{ formatCents(row.original.amountCents) }}</span>
            </template>
          </UTable>
          <p v-else class="text-muted text-sm">Totals only.</p>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import { addMonths, currentMonth, monthLabel } from '#shared/stewardship'

definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

const route = useRoute()
const month = ref(currentMonth())
const { data, error } = await useFetch(() => `/api/stewardship/ministries/${route.params.slug}/${month.value}`)
const budget = computed(() => data.value?.budget)
useSeoMeta({ title: () => `${budget.value?.ministry.name ?? 'Ministry'} budget | Lifegate Baptist Church` })

type LedgerRow = { id: string, postedOn: string, payee: string | null, memo: string | null, amountCents: number }
const columns: TableColumn<LedgerRow>[] = [
  { accessorKey: 'postedOn', header: 'Date' },
  { accessorKey: 'payee', header: 'Paid to' },
  { accessorKey: 'memo', header: 'Memo' },
  { id: 'amount', header: 'Amount', meta: { class: { th: 'text-right', td: 'text-right' } } },
]
</script>
