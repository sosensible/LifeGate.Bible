<template>
  <div>
    <AdminStewardshipHeader title="Budget">
      <div v-if="canManage" class="flex flex-wrap gap-2">
        <UButton variant="outline" class="text-white ring-white/40 hover:bg-white/10" icon="i-lucide-target" @click="openPlan(null)">Plan</UButton>
        <UButton color="secondary" icon="i-lucide-hand-coins" :disabled="!budget?.neededCents" @click="previewFunding">Fund plans</UButton>
      </div>
    </AdminStewardshipHeader>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-8">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'The budget could not be loaded.')" />

        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 class="font-serif text-2xl font-bold text-highlighted">{{ monthLabel(month) }}</h2>
            <p class="text-toned text-sm">Activity is each category's transactions posted in {{ monthLabel(month) }}. Click an amount to see them.</p>
          </div>
          <div class="flex items-center gap-2">
            <UFieldGroup>
              <UButton color="neutral" variant="outline" icon="i-lucide-chevron-left" aria-label="Previous month" @click="month = addMonths(month, -1)" />
              <USelectMenu v-model="month" :items="monthItems" value-key="value" :search-input="false" class="w-48" aria-label="Month" />
              <UButton color="neutral" variant="outline" icon="i-lucide-chevron-right" aria-label="Next month" @click="month = addMonths(month, 1)" />
            </UFieldGroup>
            <UButton v-if="month !== thisMonth" color="neutral" variant="ghost" @click="month = thisMonth">This month</UButton>
          </div>
        </div>

        <template v-if="budget">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <UCard :ui="{ root: budget.availableToFundCents < 0 ? 'ring-error' : '' }">
              <p class="text-xs font-bold tracking-wider uppercase text-muted">Available to Fund</p>
              <p class="text-3xl font-bold tabular-nums mt-1" :class="budget.availableToFundCents < 0 ? 'text-error' : 'text-highlighted'">
                {{ formatCents(budget.availableToFundCents) }}
              </p>
              <p class="text-muted text-xs mt-1">
                {{ budget.availableToFundCents < 0 ? 'More has been funded than the church has in cash.' : 'Cash not yet given to a category.' }}
              </p>
            </UCard>
            <UCard>
              <p class="text-xs font-bold tracking-wider uppercase text-muted">Cash</p>
              <p class="text-3xl font-bold tabular-nums mt-1 text-highlighted">{{ formatCents(budget.cashCents) }}</p>
              <p class="text-muted text-xs mt-1">Checking, savings and cash at the end of {{ monthLabel(month) }}.</p>
            </UCard>
            <UCard>
              <p class="text-xs font-bold tracking-wider uppercase text-muted">Needed this month</p>
              <p class="text-3xl font-bold tabular-nums mt-1" :class="budget.neededCents ? 'text-warning' : 'text-highlighted'">{{ formatCents(budget.neededCents) }}</p>
              <p class="text-muted text-xs mt-1">{{ budget.neededCents ? 'What plans still need funded.' : 'Every plan is funded for this month.' }}</p>
            </UCard>
            <UCard>
              <p class="text-xs font-bold tracking-wider uppercase text-muted">Uncategorized</p>
              <p class="text-3xl font-bold tabular-nums mt-1 text-highlighted">{{ budget.uncategorizedCount }}</p>
              <p class="text-muted text-xs mt-1">
                {{ budget.uncategorizedCount ? `${formatCents(budget.uncategorizedCents)} not in Available to Fund until categorized.` : 'Every transaction has a category.' }}
              </p>
              <template v-if="budget.uncategorizedCount" #footer>
                <UButton size="sm" variant="link" trailing-icon="i-lucide-arrow-right" :to="{ path: '/admin/stewardship/transactions', query: { categoryId: 'uncategorized' } }" class="px-0">
                  Categorize
                </UButton>
              </template>
            </UCard>
          </div>

          <UAlert
            v-if="!budget.groups.some(g => g.categories.length)"
            color="info"
            variant="subtle"
            icon="i-lucide-folder-plus"
            title="No categories yet"
            description="Add category groups and their categories before funding the budget. Groups are also the sections of the semi-annual reports."
            :actions="canManage ? [{ label: 'Add category groups', icon: 'i-lucide-folder-plus', to: '/admin/stewardship/categories', color: 'info', variant: 'solid' }] : []"
          />

          <template v-else>
            <UCard v-for="group in budget.groups" :key="group.id" :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <h2 class="font-serif text-xl font-bold text-highlighted">{{ group.name }}</h2>
              </template>
              <UTable :data="group.categories" :columns="columns" empty="No categories in this group." :ui="{ tfoot: 'bg-elevated/50' }">
                <!-- Group totals, under their columns -->
                <template #name-footer>
                  <span class="font-semibold text-highlighted">{{ group.name }} total</span>
                </template>
                <template #funded-footer>
                  <span class="block text-right tabular-nums font-semibold text-highlighted">{{ formatCents(group.fundedCents) }}</span>
                </template>
                <template #activity-footer>
                  <span class="block text-right tabular-nums font-semibold text-highlighted">{{ formatCents(group.activityCents) }}</span>
                </template>
                <template #remaining-footer>
                  <span class="block text-right tabular-nums font-semibold" :class="group.remainingCents < 0 ? 'text-error' : 'text-highlighted'">{{ formatCents(group.remainingCents) }}</span>
                </template>
                <template #needed-footer>
                  <span v-if="group.neededCents" class="block text-right tabular-nums font-semibold text-highlighted">{{ formatCents(group.neededCents) }}</span>
                </template>
                <template #name-cell="{ row }">
                  <span class="text-highlighted">{{ row.original.name }}</span>
                  <UTooltip v-if="!row.original.rollover" text="Resets each month: what is left returns to Available to Fund">
                    <UIcon name="i-lucide-rotate-ccw" class="size-3.5 text-muted ml-1.5 align-middle" />
                  </UTooltip>
                  <UTooltip v-if="row.original.isSensitive" text="Sensitive: ministries see totals only">
                    <UIcon name="i-lucide-shield" class="size-3.5 text-muted ml-1.5 align-middle" />
                  </UTooltip>
                </template>
                <template #funded-cell="{ row }">
                  <AdminMoneyInput
                    v-if="canManage"
                    :model-value="row.original.fundedCents"
                    size="sm"
                    class="w-36 ml-auto"
                    :aria-label="`Funded for ${row.original.name}`"
                    @change="cents => saveFunding(row.original.id, cents)"
                  />
                  <span v-else class="tabular-nums">{{ formatCents(row.original.fundedCents) }}</span>
                </template>
                <template #activity-cell="{ row }">
                  <UButton
                    variant="link"
                    :color="row.original.activityCents > 0 ? 'success' : 'neutral'"
                    class="tabular-nums px-0"
                    :aria-label="`${row.original.name} activity for ${monthLabel(month)}`"
                    @click="activityFor = row.original"
                  >
                    {{ formatCents(row.original.activityCents) }}
                  </UButton>
                </template>
                <template #needed-cell="{ row }">
                  <div v-if="row.original.plan" class="flex flex-col items-end gap-1">
                    <div class="flex items-center gap-2">
                      <UTooltip :text="row.original.plan.dueOn ? `Due ${formatDueDate(row.original.plan.dueOn)}${row.original.plan.deadline === 'byMonth' ? ', funded before that month' : ''}` : 'Monthly plan'">
                        <UBadge variant="subtle" size="sm" :color="PLAN_STATUS_BADGES[row.original.plan.status].color">{{ PLAN_STATUS_BADGES[row.original.plan.status].label }}</UBadge>
                      </UTooltip>
                      <span class="tabular-nums" :class="row.original.plan.neededCents ? 'text-highlighted font-semibold' : 'text-muted'">{{ formatCents(row.original.plan.neededCents) }}</span>
                      <UButton v-if="canManage && row.original.plan.neededCents" size="xs" variant="soft" color="primary" :loading="fundingOne === row.original.id" @click="fundOne(row.original)">Fund</UButton>
                      <UButton v-if="canManage" size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" :aria-label="`Edit the plan for ${row.original.name}`" @click="openPlan(row.original.id)" />
                    </div>
                    <UProgress
                      v-if="row.original.plan.status !== 'notStarted'"
                      :model-value="progress(row.original)"
                      size="xs"
                      class="w-40"
                      :color="row.original.plan.status === 'onTrack' ? 'success' : row.original.plan.status === 'underfunded' ? 'warning' : 'error'"
                    />
                  </div>
                  <UButton v-else-if="canManage" size="xs" variant="outline" color="neutral" icon="i-lucide-target" @click="openPlan(row.original.id)">Add plan</UButton>
                  <span v-else class="text-muted text-xs">No plan</span>
                </template>
                <template #remaining-cell="{ row }">
                  <UBadge variant="subtle" class="tabular-nums" :color="row.original.remainingCents < 0 ? 'error' : row.original.remainingCents > 0 ? 'success' : 'neutral'">
                    {{ formatCents(row.original.remainingCents) }}
                  </UBadge>
                </template>
              </UTable>
            </UCard>
          </template>
        </template>
      </div>
    </div>

    <UModal
      :open="activityFor !== null"
      :title="activityFor ? `${activityFor.name} · ${monthLabel(month)}` : ''"
      :description="activityFor ? `Activity ${formatCents(activityFor.activityCents)}. Choose a transaction to open it.` : ''"
      :ui="{ content: 'sm:max-w-3xl' }"
      @update:open="value => { if (!value) activityFor = null }"
    >
      <template #body>
        <AdminBudgetCategoryTransactions
          v-if="activityFor"
          :category-id="activityFor.id"
          :category-name="activityFor.name"
          :month="month"
          @select="openTransaction"
        />
      </template>
    </UModal>

    <AdminPlanSlideover v-if="canManage" v-model:open="planOpen" :month="month" :category-id="planCategoryId" @changed="refresh" />

    <UModal
      v-model:open="fundingOpen"
      :title="`Fund plans for ${monthLabel(month)}`"
      :description="funding ? `${formatCents(funding.totalCents)} from Available to Fund (${formatCents(funding.availableToFundCents)}).` : ''"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div v-if="funding" class="space-y-4">
          <UAlert
            v-if="funding.shortfallCents > 0"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="`${formatCents(funding.shortfallCents)} short`"
            description="Available to Fund does not cover every plan. Plans are funded in budget order until it runs out."
          />
          <UTable :data="funding.lines" :columns="fundingColumns">
            <template #needed-cell="{ row }">
              <span class="tabular-nums text-toned">{{ formatCents(row.original.neededCents) }}</span>
            </template>
            <template #fund-cell="{ row }">
              <span class="tabular-nums font-semibold" :class="row.original.fundCents < row.original.neededCents ? 'text-warning' : 'text-highlighted'">{{ formatCents(row.original.fundCents) }}</span>
            </template>
          </UTable>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="fundingOpen = false">Cancel</UButton>
        <UButton :loading="fundingBusy" :disabled="!funding?.totalCents" icon="i-lucide-hand-coins" @click="confirmFunding">Fund {{ funding ? formatCents(funding.totalCents) : '' }}</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import { addMonths, currentMonth, monthLabel, type BudgetCategoryRow, type BudgetMonthView, type FundPlansResult } from '#shared/stewardship'

definePageMeta({
  middleware: 'auth',
  permission: { stewardship: ['view'] },
  layout: 'default',
})
useSeoMeta({ title: 'Budget | Lifegate Baptist Church' })

const auth = useAuthStore()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const canManage = computed(() => auth.can({ stewardship: ['manage'] }))

// `footer` turns on the table footer; the group totals fill it through the #…-footer slots.
const columns: TableColumn<BudgetCategoryRow>[] = [
  { id: 'name', header: 'Category', footer: 'Total' },
  { id: 'funded', header: 'Funded', footer: '', meta: { class: { th: 'text-right w-44', td: 'text-right' } } },
  { id: 'activity', header: 'Activity', footer: '', meta: { class: { th: 'text-right w-36', td: 'text-right tabular-nums' } } },
  { id: 'remaining', header: 'Remaining', footer: '', meta: { class: { th: 'text-right w-36', td: 'text-right' } } },
  { id: 'needed', header: 'Plan', footer: '', meta: { class: { th: 'text-right w-64', td: 'text-right' } } },
]
const fundingColumns: TableColumn<FundPlansResult['lines'][number]>[] = [
  { accessorKey: 'name', header: 'Category' },
  { id: 'needed', header: 'Needed', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { id: 'fund', header: 'Will fund', meta: { class: { th: 'text-right', td: 'text-right' } } },
]

const thisMonth = currentMonth()
const month = ref(typeof route.query.month === 'string' && /^\d{4}-\d{2}$/.test(route.query.month) ? route.query.month : thisMonth)
watch(month, value => router.replace({ query: value === thisMonth ? {} : { month: value } }))
// A year ahead of the chosen month (to fund early) and two years back.
const monthItems = computed(() => Array.from({ length: 37 }, (_, i) => addMonths(month.value, 12 - i)).map(value => ({ value, label: monthLabel(value) })))

const { data, error, refresh } = await useFetch(() => `/api/admin/stewardship/budget/${month.value}`)
const budget = ref<BudgetMonthView | null>(data.value?.budget ?? null)
watch(data, value => budget.value = value?.budget ?? null)

// The Activity popup, and opening one of its transactions on the Transactions tab.
const activityFor = ref<BudgetCategoryRow | null>(null)
const openTransaction = (transactionId: string) => {
  const category = activityFor.value
  activityFor.value = null
  if (!category) return
  navigateTo({ path: '/admin/stewardship/transactions', query: { categoryId: category.id, month: month.value, transactionId } })
}

// Plans
const planOpen = ref(false)
const planCategoryId = ref<string | null>(null)
// null opens the list of every category; an id opens that category's plan.
const openPlan = (categoryId: string | null) => {
  planCategoryId.value = categoryId
  planOpen.value = true
}

// This month's progress toward what the plan asks: funded ÷ (funded + still needed).
const progress = (row: BudgetCategoryRow) => {
  const needed = row.plan?.neededCents ?? 0
  const funded = Math.max(row.fundedCents, 0)
  return funded + needed === 0 ? 100 : Math.round((funded / (funded + needed)) * 100)
}

const funding = ref<FundPlansResult | null>(null)
const fundingOpen = ref(false)
const fundingBusy = ref(false)
const fundingOne = ref<string | null>(null)

const previewFunding = async () => {
  try {
    const { result } = await $fetch(`/api/admin/stewardship/budget/${month.value}/fund-plans`, { method: 'POST', body: { dryRun: true } })
    funding.value = result
    fundingOpen.value = true
  }
  catch (err) {
    toast.add({ title: 'Could not work out funding', description: apiErrorMessage(err), color: 'error' })
  }
}

const confirmFunding = async () => {
  fundingBusy.value = true
  try {
    const response = await $fetch(`/api/admin/stewardship/budget/${month.value}/fund-plans`, { method: 'POST', body: { dryRun: false } })
    if ('budget' in response && response.budget) budget.value = response.budget
    fundingOpen.value = false
    toast.add({ title: 'Plans funded', description: `${formatCents(response.result.totalCents)} funded for ${monthLabel(month.value)}.`, color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (err) {
    toast.add({ title: 'Plans not funded', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    fundingBusy.value = false
  }
}

const fundOne = async (row: BudgetCategoryRow) => {
  fundingOne.value = row.id
  try {
    const response = await $fetch(`/api/admin/stewardship/budget/${month.value}/fund-plans`, { method: 'POST', body: { dryRun: false, categoryIds: [row.id] } })
    if ('budget' in response && response.budget) budget.value = response.budget
    if (response.result.shortfallCents > 0) {
      toast.add({ title: 'Partly funded', description: `Available to Fund covered ${formatCents(response.result.totalCents)} of ${formatCents(row.plan?.neededCents ?? 0)}.`, color: 'warning' })
    }
  }
  catch (err) {
    toast.add({ title: 'Not funded', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    fundingOne.value = null
  }
}

const saveFunding = async (categoryId: string, fundedCents: number) => {
  try {
    const result = await $fetch(`/api/admin/stewardship/budget/${month.value}/${categoryId}`, { method: 'PUT', body: { fundedCents } })
    budget.value = result.budget
  }
  catch (err) {
    toast.add({ title: 'Funding not saved', description: apiErrorMessage(err), color: 'error' })
  }
}
</script>
