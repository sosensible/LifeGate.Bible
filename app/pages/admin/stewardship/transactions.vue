<template>
  <div>
    <AdminStewardshipHeader title="Transactions">
      <div v-if="canManage" class="flex flex-wrap gap-2">
        <UButton variant="outline" class="text-white ring-white/40 hover:bg-white/10" icon="i-lucide-refresh-cw" :loading="syncing" :disabled="!sync?.configured" @click="syncNow">
          Check the bank
        </UButton>
        <UButton v-if="view === 'recurring'" color="secondary" icon="i-lucide-plus" @click="openRecurring(null)">Add recurring</UButton>
        <UButton v-else color="secondary" icon="i-lucide-plus" @click="openEditor(null)">Add transaction</UButton>
      </div>
    </AdminStewardshipHeader>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-6">
        <UTabs v-model="view" :items="viewItems" :content="false" class="w-full sm:w-96" />

        <AdminRecurringPanel v-if="view === 'recurring'" ref="recurringPanel" @edit="openRecurring" />

        <template v-else>
          <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Transactions could not be loaded.')" />

          <UAlert
            v-if="lastRun"
            :color="lastRun.status === 'failed' ? 'error' : lastRun.messages.length ? 'warning' : 'neutral'"
            variant="subtle"
            :icon="lastRun.status === 'failed' ? 'i-lucide-circle-alert' : 'i-lucide-landmark'"
            :title="`Bank last checked ${formatDateTime(lastRun.startedAt)}${lastRun.status === 'succeeded' ? ` · ${lastRun.transactionsAdded} new` : ''}`"
            :description="lastRun.messages.join(' ') || undefined"
          />
          <UAlert v-else-if="sync && !sync.configured" color="info" variant="subtle" icon="i-lucide-plug" title="The bank is not connected" description="See the Accounts page for how to connect SimpleFIN. Manual accounts work without it." />

          <div class="flex flex-wrap items-end gap-3">
            <UInput v-model="search" icon="i-lucide-search" placeholder="Search payee or memo..." class="w-full sm:w-64" />
            <USelectMenu v-model="filters.accountId" :items="accountItems" value-key="value" placeholder="All accounts" clear class="w-full sm:w-48" />
            <USelectMenu v-model="filters.categoryId" :items="filterCategoryItems" value-key="value" placeholder="All categories" clear class="w-full sm:w-56" />
            <USelectMenu v-model="filters.month" :items="monthItems" value-key="value" placeholder="All months" clear class="w-full sm:w-48" />
            <UBadge v-if="uncategorized" color="warning" variant="subtle" class="ml-auto cursor-pointer" @click="filters.categoryId = 'uncategorized'">
              {{ uncategorized }} uncategorized
            </UBadge>
          </div>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <UTable :data="transactions" :columns="columns" :meta="tableMeta" :loading="status === 'pending'" empty="No transactions match.">
              <template #date-cell="{ row }">
                <span class="whitespace-nowrap text-toned">{{ row.original.postedOn }}</span>
              </template>
              <template #payee-cell="{ row }">
                <UUser
                  :name="row.original.payee || row.original.bankDescription || 'No payee'"
                  :description="[row.original.accountName, row.original.payee ? row.original.bankDescription : null, row.original.memo].filter(Boolean).join(' · ')"
                  :class="canManage ? 'cursor-pointer' : ''"
                  @click="canManage && openEditor(row.original)"
                />
              </template>
              <template #category-cell="{ row }">
                <UBadge v-if="row.original.isTransfer" color="neutral" variant="subtle" icon="i-lucide-arrow-left-right">Transfer</UBadge>
                <UButton v-else-if="row.original.splits.length > 1" size="xs" color="neutral" variant="outline" icon="i-lucide-split" @click="openEditor(row.original)">
                  Split ({{ row.original.splits.length }})
                </UButton>
                <USelectMenu
                  v-else-if="canManage"
                  :model-value="row.original.splits[0]?.categoryId ?? undefined"
                  :items="categoryItems"
                  value-key="value"
                  placeholder="Uncategorized"
                  size="sm"
                  class="w-52"
                  :color="row.original.splits[0]?.categoryId ? 'neutral' : 'warning'"
                  :highlight="!row.original.splits[0]?.categoryId"
                  @update:model-value="(value: string) => categorize(row.original, value)"
                />
                <span v-else class="text-toned">{{ row.original.splits[0]?.categoryName ?? 'Uncategorized' }}</span>
              </template>
              <template #amount-cell="{ row }">
                <span class="tabular-nums font-semibold" :class="row.original.amountCents > 0 ? 'text-success' : 'text-highlighted'">
                  {{ formatCents(row.original.amountCents) }}
                </span>
              </template>
              <template #actions-cell="{ row }">
                <UButton v-if="canManage" size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${row.original.payee ?? 'transaction'}`" @click="openEditor(row.original)" />
              </template>
            </UTable>
          </UCard>

          <div v-if="total > pageSize" class="flex justify-center">
            <UPagination v-model:page="filters.page" :total="total" :items-per-page="pageSize" />
          </div>
        </template>
      </div>
    </div>

    <AdminTransactionSlideover
      v-if="canManage"
      v-model:open="editorOpen"
      :transaction="editing"
      :accounts="accounts"
      :groups="groups"
      @saved="onSaved"
      @removed="refresh"
      @rules-changed="refresh"
    />

    <AdminRecurringSlideover
      v-if="canManage"
      v-model:open="recurringOpen"
      :item="editingRecurring"
      :accounts="accounts"
      :groups="groups"
      @saved="recurringPanel?.refresh()"
    />
  </div>
</template>

<script setup lang="ts">
import type { TableColumn, TableMeta } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import type { AccountView, CategoryGroupView, RecurringView, SyncRunView, TransactionView } from '#shared/stewardship'

definePageMeta({
  middleware: 'auth',
  permission: { stewardship: ['view'] },
  layout: 'default',
})
useSeoMeta({ title: 'Transactions | Lifegate Baptist Church' })

const auth = useAuthStore()
const toast = useToast()
const route = useRoute()
const canManage = computed(() => auth.can({ stewardship: ['manage'] }))

// Transactions | Recurring, kept in the URL so links can open either.
const router = useRouter()
const viewItems = [
  { label: 'Transactions', value: 'transactions', icon: 'i-lucide-list' },
  { label: 'Recurring', value: 'recurring', icon: 'i-lucide-repeat' },
]
const view = ref(route.query.view === 'recurring' ? 'recurring' : 'transactions')
watch(view, value => router.replace({ query: { ...route.query, view: value === 'recurring' ? 'recurring' : undefined } }))

const recurringPanel = useTemplateRef<{ refresh: () => Promise<unknown> }>('recurringPanel')
const recurringOpen = ref(false)
const editingRecurring = ref<RecurringView | null>(null)
const openRecurring = (item: RecurringView | null) => {
  editingRecurring.value = item
  recurringOpen.value = true
}

const pageSize = 50
const queryText = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
const filters = reactive({
  accountId: queryText(route.query.accountId),
  categoryId: queryText(route.query.categoryId),
  month: queryText(route.query.month),
  search: '',
  page: 1,
})

// Wait for a pause in typing before searching.
const search = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { filters.search = value.trim() }, 300)
})
watch(() => [filters.accountId, filters.categoryId, filters.month, filters.search], () => { filters.page = 1 })

const query = computed(() => ({
  accountId: filters.accountId,
  categoryId: filters.categoryId,
  month: filters.month,
  search: filters.search || undefined,
  page: filters.page,
  pageSize,
}))

const [{ data, error, status, refresh }, { data: accountData }, { data: groupData }, { data: syncData, refresh: refreshSync }] = await Promise.all([
  useFetch('/api/admin/stewardship/transactions', { query }),
  useFetch('/api/admin/stewardship/accounts'),
  useFetch('/api/admin/stewardship/category-groups'),
  useFetch('/api/admin/stewardship/sync-runs'),
])

const transactions = ref<TransactionView[]>(data.value?.transactions ?? [])
watch(data, value => transactions.value = value?.transactions ?? [])
const total = computed(() => data.value?.total ?? 0)
const uncategorized = computed(() => data.value?.uncategorized ?? 0)

const accounts = computed<AccountView[]>(() => accountData.value?.accounts ?? [])
const groups = computed<CategoryGroupView[]>(() => groupData.value?.groups ?? [])
const sync = computed(() => syncData.value)
const lastRun = computed<SyncRunView | undefined>(() => sync.value?.runs[0])

const accountItems = computed(() => accounts.value.map(a => ({ label: a.name, value: a.id })))
const categoryItems = computed(() => categoryMenuItems(groups.value))
const filterCategoryItems = computed(() => categoryMenuItems(groups.value, { uncategorized: true }))
const monthItems = recentMonthItems()

const columns: TableColumn<TransactionView>[] = [
  { id: 'date', header: 'Date' },
  { id: 'payee', header: 'Payee' },
  { id: 'category', header: 'Category' },
  { id: 'amount', header: 'Amount', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { id: 'actions', header: '' },
]

const formatDateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

// Arriving from the budget's Activity popup: highlight that transaction and open it.
const selectedId = ref(queryText(route.query.transactionId))
const tableMeta: TableMeta<TransactionView> = {
  class: {
    tr: row => (row.original.id === selectedId.value ? 'bg-primary/10' : ''),
  },
}

const editorOpen = ref(false)
const editing = ref<TransactionView | null>(null)
const openEditor = (transaction: TransactionView | null) => {
  editing.value = transaction
  editorOpen.value = true
}

onMounted(async () => {
  if (!selectedId.value) return
  try {
    const { transaction } = await $fetch(`/api/admin/stewardship/transactions/${selectedId.value}`)
    if (canManage.value) openEditor(transaction)
  }
  catch (err) {
    toast.add({ title: 'That transaction could not be opened', description: apiErrorMessage(err), color: 'warning' })
  }
})

const onSaved = (saved: TransactionView) => {
  const index = transactions.value.findIndex(t => t.id === saved.id)
  if (index === -1) refresh()
  else transactions.value.splice(index, 1, saved)
}

const categorize = async (transaction: TransactionView, categoryId: string) => {
  try {
    const { transaction: saved } = await $fetch(`/api/admin/stewardship/transactions/${transaction.id}/splits`, {
      method: 'PUT',
      body: { splits: [{ categoryId, amountCents: transaction.amountCents, memo: transaction.splits[0]?.memo ?? null }] },
    })
    onSaved(saved!)
    if (!transaction.splits[0]?.categoryId && data.value) data.value.uncategorized = Math.max(data.value.uncategorized - 1, 0)
  }
  catch (err) {
    toast.add({ title: 'Category not saved', description: apiErrorMessage(err), color: 'error' })
  }
}

const syncing = ref(false)
const syncNow = async () => {
  syncing.value = true
  try {
    const { run } = await $fetch('/api/admin/stewardship/sync', { method: 'POST' })
    toast.add(run.status === 'succeeded'
      ? { title: 'Bank checked', description: `${run.transactionsAdded} new ${run.transactionsAdded === 1 ? 'transaction' : 'transactions'}.`, color: 'success', icon: 'i-lucide-circle-check' }
      : { title: 'The bank could not be checked', description: run.messages.join(' '), color: 'error' })
    await Promise.all([refresh(), refreshSync()])
  }
  catch (err) {
    toast.add({ title: 'Not checked', description: apiErrorMessage(err), color: 'warning' })
  }
  finally {
    syncing.value = false
  }
}
</script>
