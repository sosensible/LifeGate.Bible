<template>
  <USlideover
    v-model:open="open"
    :title="transaction ? (transaction.payee || transaction.bankDescription || 'Transaction') : 'Add a transaction'"
    :description="transaction ? `${transaction.accountName} · ${transaction.postedOn} · ${formatCents(transaction.amountCents)}` : 'For manual accounts such as the cash box. Bank transactions arrive on their own.'"
    :ui="{ content: 'max-w-2xl', footer: 'justify-between' }"
  >
    <template #body>
      <!-- Add -->
      <UForm v-if="!transaction" id="transaction-form" :state="draft" class="space-y-4" @submit="create">
        <UAlert v-if="!manualAccounts.length" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="No manual accounts" description="Add a manual account (such as the cash box) on the Accounts page first." />
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Account" name="accountId" required>
            <USelect v-model="draft.accountId" :items="manualAccounts" value-key="id" label-key="name" placeholder="Choose an account" class="w-full" />
          </UFormField>
          <UFormField label="Date" name="postedOn" required>
            <UInput v-model="draft.postedOn" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Money" name="direction">
            <URadioGroup v-model="draft.direction" orientation="horizontal" :items="[{ value: 'out', label: 'Out' }, { value: 'in', label: 'In' }]" />
          </UFormField>
          <UFormField label="Amount" name="amount" required>
            <AdminMoneyInput v-model="draft.amountCents" class="w-full" />
          </UFormField>
          <UFormField label="Payee" name="payee">
            <UInput v-model="draft.payee" class="w-full" />
          </UFormField>
          <UFormField label="Category" name="categoryId">
            <USelectMenu v-model="draft.categoryId" :items="categoryItems" value-key="value" placeholder="Uncategorized" clear class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Memo" name="memo">
          <UInput v-model="draft.memo" class="w-full" />
        </UFormField>
      </UForm>

      <!-- Edit -->
      <UForm v-else id="transaction-form" :state="state" class="space-y-8" @submit="save">
        <section class="space-y-4">
          <UFormField v-if="transaction.bankDescription" label="From the bank">
            <p class="text-sm text-toned">{{ transaction.bankDescription }}</p>
          </UFormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Payee" name="payee">
              <UInput v-model="state.payee" class="w-full" />
            </UFormField>
            <UFormField label="Memo" name="memo">
              <UInput v-model="state.memo" class="w-full" />
            </UFormField>
          </div>
          <USwitch v-model="state.isTransfer" label="Transfer between church accounts" description="Not spending or income, so it has no category." />
        </section>

        <section v-if="!state.isTransfer" class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-serif text-lg font-bold text-highlighted">Categories</h3>
            <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-split" @click="addLine">Split</UButton>
          </div>
          <div v-for="(line, index) in state.lines" :key="index" class="grid grid-cols-12 gap-2 items-start">
            <USelectMenu v-model="line.categoryId" :items="categoryItems" value-key="value" placeholder="Uncategorized" clear class="col-span-12 sm:col-span-5" />
            <AdminMoneyInput v-model="line.amountCents" class="col-span-5 sm:col-span-3" :aria-label="`Amount for line ${index + 1}`" />
            <UInput v-model="line.memo" placeholder="Memo" class="col-span-5 sm:col-span-3" />
            <UButton v-if="state.lines.length > 1" class="col-span-2 sm:col-span-1" variant="ghost" color="neutral" icon="i-lucide-x" :aria-label="`Remove line ${index + 1}`" @click="state.lines.splice(index, 1)" />
          </div>
          <UAlert
            v-if="unassignedCents !== 0"
            color="warning"
            variant="subtle"
            icon="i-lucide-scale"
            :description="`${formatCents(Math.abs(unassignedCents))} still to assign. The lines must add up to ${formatCents(Math.abs(transaction.amountCents))}.`"
            :actions="state.lines.length ? [{ label: 'Put it on the last line', color: 'warning', variant: 'outline', size: 'xs', onClick: fillLastLine }] : undefined"
          />
        </section>

        <UCollapsible v-if="transaction.source === 'simplefin'" class="space-y-3">
          <UButton variant="link" color="neutral" icon="i-lucide-wand-sparkles" class="px-0">Make a rule for transactions like this</UButton>
          <template #content>
            <UCard>
              <div class="space-y-4">
                <UFormField label="When the bank description contains" description="Letters only need to match, not capitals.">
                  <UInput v-model="rule.matchText" class="w-full" />
                </UFormField>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <UFormField label="Set the payee to">
                    <UInput v-model="rule.payee" placeholder="Leave as is" class="w-full" />
                  </UFormField>
                  <UFormField label="Set the category to">
                    <USelectMenu v-model="rule.categoryId" :items="categoryItems" value-key="value" placeholder="Leave as is" clear class="w-full" />
                  </UFormField>
                </div>
                <div class="flex justify-end">
                  <UButton size="sm" :loading="savingRule" :disabled="rule.matchText.trim().length < 2" @click="createRule">Add rule</UButton>
                </div>
              </div>
            </UCard>
          </template>
        </UCollapsible>
      </UForm>
    </template>

    <template #footer>
      <div>
        <UButton v-if="transaction?.source === 'manual'" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmingDelete = true">Remove</UButton>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton type="submit" form="transaction-form" :loading="saving" :disabled="Boolean(transaction && !state.isTransfer && unassignedCents !== 0)">
          {{ transaction ? 'Save' : 'Add transaction' }}
        </UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="confirmingDelete" title="Remove this transaction?" description="It will no longer count toward the account balance or the budget.">
    <template #footer>
      <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep</UButton>
      <UButton color="error" :loading="deleting" @click="remove">Remove</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { formatCents } from '#shared/money'
import type { AccountView, CategoryGroupView, TransactionView } from '#shared/stewardship'

const props = defineProps<{
  transaction: TransactionView | null
  accounts: AccountView[]
  groups: CategoryGroupView[]
}>()

const emit = defineEmits<{
  saved: [transaction: TransactionView]
  removed: [id: string]
  rulesChanged: []
}>()

const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const categoryItems = computed(() => categoryMenuItems(props.groups))
const manualAccounts = computed(() => props.accounts.filter(a => a.source === 'manual' && !a.archivedAt))

// Amounts are shown as positive numbers; the transaction's direction is applied on save.
const sign = computed(() => (props.transaction && props.transaction.amountCents < 0 ? -1 : 1))

const draft = reactive({
  accountId: undefined as string | undefined,
  postedOn: '',
  direction: 'out' as 'out' | 'in',
  amountCents: 0,
  payee: '',
  memo: '',
  categoryId: null as string | null,
})

const state = reactive({
  payee: '',
  memo: '',
  isTransfer: false,
  lines: [] as Array<{ categoryId: string | null, amountCents: number, memo: string }>,
})

const rule = reactive({ matchText: '', payee: '', categoryId: null as string | null })

const load = () => {
  const t = props.transaction
  if (!t) {
    Object.assign(draft, {
      accountId: manualAccounts.value[0]?.id,
      postedOn: new Date().toLocaleDateString('en-CA'),
      direction: 'out',
      amountCents: 0,
      payee: '',
      memo: '',
      categoryId: null,
    })
    return
  }
  Object.assign(state, {
    payee: t.payee ?? '',
    memo: t.memo ?? '',
    isTransfer: t.isTransfer,
    lines: t.splits.map(s => ({ categoryId: s.categoryId, amountCents: Math.abs(s.amountCents), memo: s.memo ?? '' })),
  })
  Object.assign(rule, {
    matchText: (t.bankDescription ?? '').split(/\s+/).slice(0, 3).join(' '),
    payee: t.payee ?? '',
    categoryId: t.splits[0]?.categoryId ?? null,
  })
}
watch(open, isOpen => isOpen && load(), { immediate: true })

const unassignedCents = computed(() =>
  props.transaction ? Math.abs(props.transaction.amountCents) - state.lines.reduce((sum, line) => sum + line.amountCents, 0) : 0)

const addLine = () => state.lines.push({ categoryId: null, amountCents: Math.max(unassignedCents.value, 0), memo: '' })
const fillLastLine = () => {
  const last = state.lines.at(-1)
  if (last) last.amountCents = Math.max(last.amountCents + unassignedCents.value, 0)
}

const saving = ref(false)

const create = async () => {
  if (!draft.accountId || draft.amountCents <= 0) {
    toast.add({ title: 'Choose an account and enter an amount', color: 'warning', icon: 'i-lucide-triangle-alert' })
    return
  }
  saving.value = true
  try {
    const { transaction } = await $fetch('/api/admin/stewardship/transactions', {
      method: 'POST',
      body: {
        accountId: draft.accountId,
        postedOn: draft.postedOn,
        amountCents: draft.direction === 'out' ? -draft.amountCents : draft.amountCents,
        payee: draft.payee,
        memo: draft.memo,
        categoryId: draft.categoryId,
      },
    })
    emit('saved', transaction!)
    toast.add({ title: 'Transaction added', color: 'success', icon: 'i-lucide-circle-check' })
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not added', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const save = async () => {
  const t = props.transaction!
  saving.value = true
  try {
    let saved = t
    if (state.payee !== (t.payee ?? '') || state.memo !== (t.memo ?? '') || state.isTransfer !== t.isTransfer) {
      saved = (await $fetch(`/api/admin/stewardship/transactions/${t.id}`, {
        method: 'PATCH',
        body: { payee: state.payee, memo: state.memo, isTransfer: state.isTransfer },
      })).transaction!
    }
    const lines = state.lines.map(line => ({ categoryId: line.categoryId, amountCents: sign.value * line.amountCents, memo: line.memo || null }))
    const linesChanged = JSON.stringify(lines) !== JSON.stringify(t.splits.map(s => ({ categoryId: s.categoryId, amountCents: s.amountCents, memo: s.memo })))
    if (!state.isTransfer && linesChanged) {
      saved = (await $fetch(`/api/admin/stewardship/transactions/${t.id}/splits`, { method: 'PUT', body: { splits: lines } })).transaction!
    }
    emit('saved', saved)
    toast.add({ title: 'Changes saved', color: 'success', icon: 'i-lucide-circle-check' })
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const savingRule = ref(false)
const createRule = async () => {
  savingRule.value = true
  try {
    const { applied } = await $fetch('/api/admin/stewardship/rules', {
      method: 'POST',
      body: { matchText: rule.matchText, payee: rule.payee, categoryId: rule.categoryId },
    })
    toast.add({
      title: 'Rule added',
      description: applied ? `It updated ${applied} uncategorized ${applied === 1 ? 'transaction' : 'transactions'}.` : 'It will apply to new transactions from the bank.',
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
    emit('rulesChanged')
  }
  catch (error) {
    toast.add({ title: 'Rule not added', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    savingRule.value = false
  }
}

const confirmingDelete = ref(false)
const deleting = ref(false)
const remove = async () => {
  const t = props.transaction
  if (!t) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/stewardship/transactions/${t.id}`, { method: 'DELETE' })
    emit('removed', t.id)
    confirmingDelete.value = false
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not removed', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    deleting.value = false
  }
}
</script>
