<template>
  <USlideover
    v-model:open="open"
    :title="giverId ? (detail?.statementName ?? 'Giving record') : 'Add a giving record'"
    description="Who a statement goes to, usually a household. Its address and email are kept here, separate from the directory."
    :ui="{ content: 'max-w-2xl', footer: 'justify-between' }"
  >
    <template #body>
      <div class="space-y-8">
        <UForm id="giver-form" :schema="giverSchema" :state="state" :disabled="!canManage" class="space-y-4" @submit="save">
          <UFormField label="Link to the directory" name="householdId" hint="Optional" help="Only the name is used; nothing is copied from the directory.">
            <USelectMenu v-model="link" :items="linkItems" value-key="value" placeholder="Not linked" clear class="w-full" />
          </UFormField>
          <UFormField label="Name on statements" name="statementName" required>
            <UInput v-model="state.statementName" placeholder="e.g. John & Mary Smith" class="w-full" />
          </UFormField>
          <UFormField label="Mailing address" name="mailingAddress">
            <UTextarea v-model="mailingAddress" :rows="3" placeholder="Street&#10;City, State ZIP" class="w-full" />
          </UFormField>
          <UFormField label="Email" name="email">
            <UInput v-model="email" type="email" class="w-full" />
          </UFormField>
          <UFormField label="Send statements by" name="delivery">
            <URadioGroup v-model="state.delivery" orientation="horizontal" :items="[{ value: 'mail', label: 'Mail' }, { value: 'email', label: 'Email' }]" />
          </UFormField>
          <UFormField label="Notes" name="notes" hint="Optional">
            <UTextarea v-model="notes" :rows="2" class="w-full" />
          </UFormField>
          <USwitch v-if="giverId" v-model="archived" label="Archived" description="Left out of gift entry. Past gifts and statements stay." />
        </UForm>

        <section v-if="detail" class="space-y-3">
          <h3 class="font-serif text-lg font-bold text-highlighted">Gifts</h3>
          <UTable :data="detail.gifts" :columns="historyColumns" empty="No gifts yet.">
            <template #receivedOn-cell="{ row }">
              <span class="whitespace-nowrap">{{ formatDueDate(row.original.receivedOn) }}</span>
            </template>
            <template #givenTo-cell="{ row }">
              <span>{{ row.original.givenTo }}</span>
              <p v-if="row.original.memo" class="text-muted text-xs">{{ row.original.memo }}</p>
            </template>
            <template #method-cell="{ row }">
              <span class="text-toned">{{ GIFT_METHOD_LABELS[row.original.method] }}<template v-if="row.original.checkNumber"> #{{ row.original.checkNumber }}</template></span>
            </template>
            <template #amount-cell="{ row }">
              <span class="tabular-nums">{{ formatCents(row.original.amountCents) }}</span>
              <UBadge v-if="!row.original.countClosed" color="warning" variant="subtle" size="sm" class="ml-2">Open count</UBadge>
            </template>
          </UTable>
        </section>
      </div>
    </template>

    <template #footer>
      <div>
        <UButton v-if="giverId && canManage && detail && !detail.gifts.length" color="error" variant="ghost" icon="i-lucide-trash-2" :loading="saving" @click="remove">Remove</UButton>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">{{ canManage ? 'Cancel' : 'Close' }}</UButton>
        <UButton v-if="canManage" type="submit" form="giver-form" :loading="saving">{{ giverId ? 'Save' : 'Add' }}</UButton>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import { GIFT_METHOD_LABELS, giverSchema, type GiverDetail, type GiverHistoryGift, type GiverInput } from '#shared/giving'

const props = defineProps<{ giverId: string | null, year: number }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { required: true })
const auth = useAuthStore()
const toast = useToast()
const canManage = computed(() => auth.can({ giving: ['manage'] }))

const blank = (): GiverInput => ({ statementName: '', householdId: null, personId: null, mailingAddress: null, email: null, delivery: 'mail', notes: null })
const state = reactive<GiverInput>(blank())
const archived = ref(false)
const detail = ref<GiverDetail | null>(null)

const nullable = (key: 'mailingAddress' | 'email' | 'notes') => computed({
  get: () => state[key] ?? '',
  set: (value: string) => { state[key] = value.trim() ? value : null },
})
const mailingAddress = nullable('mailingAddress')
const email = nullable('email')
const notes = nullable('notes')

const { data: directory, execute: loadDirectory } = useLazyFetch('/api/admin/giving/givers/directory', { immediate: false, server: false })
const linkItems = computed(() => [
  ...(directory.value?.households.length ? [{ type: 'label' as const, label: 'Households' }] : []),
  ...(directory.value?.households ?? []).map(h => ({ value: `household:${h.id}`, label: h.name })),
  ...(directory.value?.people.length ? [{ type: 'label' as const, label: 'People' }] : []),
  ...(directory.value?.people ?? []).map(p => ({ value: `person:${p.id}`, label: p.name })),
])
const link = computed({
  get: () => state.householdId ? `household:${state.householdId}` : state.personId ? `person:${state.personId}` : undefined,
  set: (value: string | undefined) => {
    const [kind, id] = (value ?? '').split(':')
    state.householdId = kind === 'household' ? id! : null
    state.personId = kind === 'person' ? id! : null
    // Offer the directory name, without "Household", when none is typed yet.
    if (!state.statementName && value) {
      const label = linkItems.value.find(item => 'value' in item && item.value === value)?.label ?? ''
      state.statementName = label.replace(/\s+Household$/, '')
    }
  },
})

const historyColumns: TableColumn<GiverHistoryGift>[] = [
  { id: 'receivedOn', header: 'Received' },
  { accessorKey: 'givenTo', header: 'Given to' },
  { id: 'method', header: 'Method' },
  { id: 'amount', header: 'Amount', meta: { class: { th: 'text-right', td: 'text-right' } } },
]

watch(open, async (isOpen) => {
  if (!isOpen) return
  if (canManage.value) loadDirectory()
  detail.value = null
  Object.assign(state, blank())
  archived.value = false
  if (!props.giverId) return
  try {
    const { giver } = await $fetch(`/api/admin/giving/givers/${props.giverId}`, { query: { year: props.year } })
    detail.value = giver
    Object.assign(state, {
      statementName: giver.statementName, householdId: giver.householdId, personId: giver.personId,
      mailingAddress: giver.mailingAddress, email: giver.email, delivery: giver.delivery, notes: giver.notes,
    })
    archived.value = Boolean(giver.archivedAt)
  }
  catch (err) {
    toast.add({ title: 'Giving record could not be loaded', description: apiErrorMessage(err), color: 'error' })
  }
}, { immediate: true })

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const giver = { ...state }
    if (props.giverId) await $fetch(`/api/admin/giving/givers/${props.giverId}`, { method: 'PATCH', body: { giver, archived: archived.value }, query: { year: props.year } })
    else await $fetch('/api/admin/giving/givers', { method: 'POST', body: giver, query: { year: props.year } })
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

const remove = async () => {
  if (!props.giverId) return
  saving.value = true
  try {
    await $fetch(`/api/admin/giving/givers/${props.giverId}`, { method: 'DELETE' })
    emit('saved')
    open.value = false
  }
  catch (err) {
    toast.add({ title: 'Not removed', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>
