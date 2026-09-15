<template>
  <USlideover
    v-model:open="open"
    :title="item ? `Edit ${item.name}` : 'Add a recurring transaction'"
    description="A bill or other transaction that repeats. Use it as a reminder, to feed a plan, to match bank transactions, or to enter it automatically."
    :ui="{ content: 'max-w-2xl', footer: 'justify-between' }"
  >
    <template #body>
      <UForm id="recurring-form" :schema="recurringSchema" :state="state" class="space-y-8" @submit="save">
        <section class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Name" name="name" required>
              <UInput v-model="state.name" placeholder="e.g. Consumers Energy" class="w-full" />
            </UFormField>
            <UFormField label="Payee" name="payee" hint="Optional">
              <UInput v-model="state.payee" placeholder="As it should appear" class="w-full" />
            </UFormField>
            <UFormField label="Money" name="direction">
              <URadioGroup v-model="direction" orientation="horizontal" :items="[{ value: 'out', label: 'Out' }, { value: 'in', label: 'In' }]" />
            </UFormField>
            <UFormField label="Amount" name="amountCents" required>
              <AdminMoneyInput v-model="amount" class="w-full" />
            </UFormField>
          </div>
          <USwitch v-model="state.amountVaries" label="The amount varies" :description="`Bank transactions within ${Math.round(VARIES_SHARE * 100)}% of the amount can match.`" />
        </section>

        <section class="space-y-4">
          <h3 class="font-serif text-lg font-bold text-highlighted">Schedule</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <UFormField label="Repeats" name="frequency">
              <USelect v-model="state.frequency" :items="frequencyItems" class="w-full" />
            </UFormField>
            <UFormField label="First date" name="anchorOn" required>
              <UInput v-model="state.anchorOn" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Ends" name="endOn" hint="Optional">
              <UInput v-model="endOn" type="date" class="w-full" />
            </UFormField>
          </div>
        </section>

        <section class="space-y-4">
          <h3 class="font-serif text-lg font-bold text-highlighted">Category and account</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Category" name="categoryId" hint="Leave empty for a reminder">
              <USelectMenu v-model="state.categoryId" :items="categoryItems" value-key="value" placeholder="None" clear class="w-full" />
            </UFormField>
            <UFormField label="Account" name="accountId" hint="Optional">
              <USelectMenu v-model="state.accountId" :items="accountItems" value-key="value" placeholder="Any account" clear class="w-full" />
            </UFormField>
          </div>
        </section>

        <section class="space-y-4">
          <h3 class="font-serif text-lg font-bold text-highlighted">Uses</h3>
          <USwitch v-model="state.feedsPlan" label="Feeds the category’s plan" description="A plan based on recurring bills needs this amount on its schedule." :disabled="!state.categoryId" />
          <USwitch v-model="state.matchBank" label="Match bank transactions" description="A bank transaction near the due date with this amount gets this category and payee." :disabled="!state.categoryId" />
          <UFormField v-if="state.matchBank" label="Only when the bank description contains" name="matchText" hint="Optional">
            <UInput v-model="state.matchText" placeholder="e.g. CONSUMERS" class="w-full" />
          </UFormField>
          <USwitch
            v-model="state.autoEnter"
            label="Enter it automatically"
            :description="manualAccount ? `Entered in ${manualAccount.name} each due date.` : 'Choose a manual account (such as the cash box) to enter it in.'"
            :disabled="!state.categoryId || !manualAccount"
          />
        </section>

        <USwitch v-if="item" v-model="archived" label="Archived" description="Stops reminders, matching and entering. Past transactions stay." />
      </UForm>
    </template>

    <template #footer>
      <div>
        <UButton v-if="item" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmingDelete = true">Remove</UButton>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton type="submit" form="recurring-form" :loading="saving">{{ item ? 'Save' : 'Add' }}</UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="confirmingDelete" title="Remove this recurring transaction?" description="Transactions it already matched or entered are kept.">
    <template #footer>
      <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep</UButton>
      <UButton color="error" :loading="deleting" @click="remove">Remove</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABELS, recurringSchema, type AccountView, type CategoryGroupView, type RecurringInput, type RecurringView } from '#shared/stewardship'

// Matches server/lib/recurring.ts VARIES_TOLERANCE.
const VARIES_SHARE = 0.25

const props = defineProps<{
  item: RecurringView | null
  accounts: AccountView[]
  groups: CategoryGroupView[]
}>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const categoryItems = computed(() => categoryMenuItems(props.groups))
const accountItems = computed(() => props.accounts.filter(a => !a.archivedAt).map(a => ({ value: a.id, label: a.name })))
const frequencyItems = RECURRING_FREQUENCIES.map(value => ({ value, label: RECURRING_FREQUENCY_LABELS[value] }))

const blank = (): RecurringInput => ({
  name: '', payee: '', memo: '', amountCents: 0, amountVaries: false, frequency: 'monthly',
  anchorOn: new Date().toLocaleDateString('en-CA'), endOn: null, accountId: null, categoryId: null,
  feedsPlan: false, matchBank: false, matchText: '', autoEnter: false,
})
const state = reactive<RecurringInput>(blank())
const archived = ref(false)

// Shown as a positive amount with a direction; stored signed.
const direction = ref<'out' | 'in'>('out')
const amount = computed({
  get: () => Math.abs(state.amountCents),
  set: (cents: number) => { state.amountCents = direction.value === 'out' ? -cents : cents },
})
watch(direction, () => { state.amountCents = direction.value === 'out' ? -Math.abs(state.amountCents) : Math.abs(state.amountCents) })

const endOn = computed({
  get: () => state.endOn ?? '',
  set: (value: string) => { state.endOn = value || null },
})

const manualAccount = computed(() => props.accounts.find(a => a.id === state.accountId && a.source === 'manual'))

// Uses that no longer apply are switched off rather than refused.
watch(() => state.categoryId, (id) => {
  if (!id) Object.assign(state, { feedsPlan: false, matchBank: false, autoEnter: false })
})
watch(manualAccount, (account) => {
  if (!account) state.autoEnter = false
})

watch(open, (isOpen) => {
  if (!isOpen) return
  const current = props.item
  Object.assign(state, current
    ? { ...current, payee: current.payee ?? '', memo: current.memo ?? '', matchText: current.matchText ?? '' }
    : blank())
  direction.value = (current?.amountCents ?? -1) < 0 ? 'out' : 'in'
  archived.value = Boolean(current?.archivedAt)
}, { immediate: true })

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const body = {
      name: state.name, payee: state.payee, memo: state.memo, amountCents: state.amountCents, amountVaries: state.amountVaries,
      frequency: state.frequency, anchorOn: state.anchorOn, endOn: state.endOn, accountId: state.accountId, categoryId: state.categoryId,
      feedsPlan: state.feedsPlan, matchBank: state.matchBank, matchText: state.matchText, autoEnter: state.autoEnter,
    }
    if (props.item) await $fetch(`/api/admin/stewardship/recurring/${props.item.id}`, { method: 'PATCH', body: { ...body, archived: archived.value } })
    else await $fetch('/api/admin/stewardship/recurring', { method: 'POST', body })
    toast.add({ title: props.item ? 'Changes saved' : 'Recurring transaction added', color: 'success', icon: 'i-lucide-circle-check' })
    emit('saved')
    open.value = false
  }
  catch (err) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const confirmingDelete = ref(false)
const deleting = ref(false)
const remove = async () => {
  if (!props.item) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/stewardship/recurring/${props.item.id}`, { method: 'DELETE' })
    confirmingDelete.value = false
    open.value = false
    emit('saved')
  }
  catch (err) {
    toast.add({ title: 'Not removed', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    deleting.value = false
  }
}
</script>
