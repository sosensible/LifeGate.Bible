<template>
  <div>
    <AdminStewardshipHeader title="Accounts">
      <UButton v-if="canManage" color="secondary" icon="i-lucide-plus" @click="openEditor(null)">Add manual account</UButton>
    </AdminStewardshipHeader>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-8">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Accounts could not be loaded.')" />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UCard>
            <p class="text-xs font-bold tracking-wider uppercase text-muted">Cash</p>
            <p class="text-3xl font-bold tabular-nums mt-1 text-highlighted">{{ formatCents(cashCents) }}</p>
            <p class="text-muted text-xs mt-1">Checking, savings and cash accounts. This is what the budget is funded from.</p>
          </UCard>

          <UCard>
            <template v-if="sync?.configured">
              <p class="text-xs font-bold tracking-wider uppercase text-muted">Bank connection</p>
              <p class="mt-1 text-highlighted font-semibold">
                {{ lastRun ? `Last checked ${formatDateTime(lastRun.startedAt)}` : 'Connected, not checked yet' }}
              </p>
              <p class="text-muted text-xs mt-1">SimpleFIN is checked four times a day.</p>
              <UAlert v-if="lastRun?.messages.length" class="mt-3" :color="lastRun.status === 'failed' ? 'error' : 'warning'" variant="subtle" icon="i-lucide-triangle-alert" :description="lastRun.messages.join(' ')" />
            </template>
            <template v-else>
              <p class="text-xs font-bold tracking-wider uppercase text-muted">Bank connection</p>
              <p class="mt-1 text-highlighted font-semibold">Not connected</p>
              <p class="text-muted text-sm mt-1">
                Create a setup token in SimpleFIN Bridge, then on the server run
                <UKbd>npm run simplefin:claim -- &lt;token&gt;</UKbd>
                and set <UKbd>SIMPLEFIN_ACCESS_URL</UKbd>. Manual accounts work without it.
              </p>
            </template>
            <template v-if="canManage && sync?.configured" #footer>
              <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-refresh-cw" :loading="syncing" @click="syncNow">Check the bank now</UButton>
            </template>
          </UCard>
        </div>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <UTable :data="accounts" :columns="columns" empty="No accounts yet. Connect the bank or add a manual account.">
            <template #name-cell="{ row }">
              <UUser :name="row.original.name" :description="row.original.institution ?? (row.original.source === 'manual' ? 'Manual' : undefined)" />
            </template>
            <template #kind-cell="{ row }">
              <UBadge variant="subtle" :color="row.original.isCash ? 'primary' : 'neutral'">{{ ACCOUNT_KIND_LABELS[row.original.kind] }}</UBadge>
            </template>
            <template #source-cell="{ row }">
              <UBadge variant="outline" color="neutral" :icon="row.original.source === 'simplefin' ? 'i-lucide-landmark' : 'i-lucide-hand'">
                {{ row.original.source === 'simplefin' ? 'Bank' : 'Manual' }}
              </UBadge>
              <UBadge v-if="row.original.archivedAt" variant="subtle" color="warning" class="ml-1">Archived</UBadge>
            </template>
            <template #balance-cell="{ row }">
              <span class="tabular-nums font-semibold" :class="row.original.balanceCents < 0 ? 'text-error' : 'text-highlighted'">{{ formatCents(row.original.balanceCents) }}</span>
              <span v-if="row.original.balanceDate" class="block text-xs text-muted">as of {{ formatDate(row.original.balanceDate) }}</span>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-list" :to="{ path: '/admin/stewardship/transactions', query: { accountId: row.original.id } }" :aria-label="`Transactions in ${row.original.name}`" />
                <UButton v-if="canManage" size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${row.original.name}`" @click="openEditor(row.original)" />
              </div>
            </template>
          </UTable>
        </UCard>
      </div>
    </div>

    <UModal v-model:open="editorOpen" :title="editing ? `Edit ${editing.name}` : 'Add a manual account'" description="Checking, savings and cash accounts count toward the budget's cash.">
      <template #body>
        <UForm id="account-form" :schema="formSchema" :state="state" class="space-y-4" @submit="save">
          <UFormField label="Name" name="name" required>
            <UInput v-model="state.name" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Kind" name="kind">
              <USelect v-model="state.kind" :items="kindItems" class="w-full" />
            </UFormField>
            <UFormField label="Institution" name="institution">
              <UInput v-model="state.institution" class="w-full" />
            </UFormField>
          </div>
          <UFormField v-if="!editing || editing.source === 'manual'" label="Opening balance" name="openingBalanceCents" description="The balance before the first transaction you enter.">
            <AdminMoneyInput v-model="state.openingBalanceCents" class="w-full" />
          </UFormField>
          <USwitch v-if="editing" v-model="state.archived" label="Archived" description="Hidden from choices. Its history stays in the budget." />
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="editorOpen = false">Cancel</UButton>
        <UButton type="submit" form="account-form" :loading="saving">{{ editing ? 'Save' : 'Add account' }}</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import { ACCOUNT_KIND_LABELS, ACCOUNT_KINDS, accountCreateSchema, type AccountView } from '#shared/stewardship'

definePageMeta({
  middleware: 'auth',
  permission: { stewardship: ['view'] },
  layout: 'default',
})
useSeoMeta({ title: 'Accounts | Lifegate Baptist Church' })

const auth = useAuthStore()
const toast = useToast()
const canManage = computed(() => auth.can({ stewardship: ['manage'] }))

const [{ data, error, refresh }, { data: syncData, refresh: refreshSync }] = await Promise.all([
  useFetch('/api/admin/stewardship/accounts'),
  useFetch('/api/admin/stewardship/sync-runs'),
])

const accounts = computed<AccountView[]>(() => data.value?.accounts ?? [])
const cashCents = computed(() => accounts.value.filter(a => a.isCash).reduce((sum, a) => sum + a.balanceCents, 0))
const sync = computed(() => syncData.value)
const lastRun = computed(() => sync.value?.runs[0])

const columns: TableColumn<AccountView>[] = [
  { id: 'name', header: 'Account' },
  { id: 'kind', header: 'Kind' },
  { id: 'source', header: 'Source' },
  { id: 'balance', header: 'Balance', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { id: 'actions', header: '' },
]

const kindItems = ACCOUNT_KINDS.map(value => ({ value, label: ACCOUNT_KIND_LABELS[value] }))
const formSchema = accountCreateSchema.partial({ openingBalanceCents: true })

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })
const formatDateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

const editorOpen = ref(false)
const editing = ref<AccountView | null>(null)
const state = reactive({ name: '', kind: 'checking' as AccountView['kind'], institution: '', openingBalanceCents: 0, archived: false })

const openEditor = (account: AccountView | null) => {
  editing.value = account
  Object.assign(state, account
    ? { name: account.name, kind: account.kind, institution: account.institution ?? '', openingBalanceCents: account.openingBalanceCents, archived: Boolean(account.archivedAt) }
    : { name: '', kind: 'cash', institution: '', openingBalanceCents: 0, archived: false })
  editorOpen.value = true
}

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const account = editing.value
    const body = {
      name: state.name,
      kind: state.kind,
      institution: state.institution,
      ...(!account || account.source === 'manual' ? { openingBalanceCents: state.openingBalanceCents } : {}),
    }
    if (account) await $fetch(`/api/admin/stewardship/accounts/${account.id}`, { method: 'PATCH', body: { ...body, archived: state.archived } })
    else await $fetch('/api/admin/stewardship/accounts', { method: 'POST', body })
    await refresh()
    editorOpen.value = false
    toast.add({ title: account ? 'Changes saved' : 'Account added', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (err) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const syncing = ref(false)
const syncNow = async () => {
  syncing.value = true
  try {
    const { run } = await $fetch('/api/admin/stewardship/sync', { method: 'POST' })
    toast.add(run.status === 'succeeded'
      ? { title: 'Bank checked', description: `${run.accountsSeen} ${run.accountsSeen === 1 ? 'account' : 'accounts'}, ${run.transactionsAdded} new ${run.transactionsAdded === 1 ? 'transaction' : 'transactions'}.`, color: 'success', icon: 'i-lucide-circle-check' }
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
