<template>
  <div>
    <AdminStewardshipHeader :title="count ? countTitle(count) : 'Offering count'">
      <div v-if="count" class="flex flex-wrap gap-2">
        <UButton to="/admin/stewardship/offerings" variant="outline" class="text-white ring-white/40 hover:bg-white/10" icon="i-lucide-arrow-left">All counts</UButton>
        <template v-if="canManage">
          <UButton v-if="isOpen" color="secondary" icon="i-lucide-lock" :disabled="!count.balanced" :loading="busy" @click="closeCount">Close count</UButton>
          <UButton v-else-if="!count.deposit" variant="outline" class="text-white ring-white/40 hover:bg-white/10" icon="i-lucide-lock-open" @click="reopenOpen = true">Reopen</UButton>
        </template>
      </div>
    </AdminStewardshipHeader>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-8">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'This count could not be loaded.')" />

        <template v-if="count">
          <!-- Sheet vs entered -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="isOpen ? 'warning' : 'success'" variant="subtle" size="lg">{{ isOpen ? 'Open' : 'Closed' }}</UBadge>
              <span v-if="count.counterNames" class="text-toned text-sm">Counted by {{ count.counterNames }}</span>
            </div>
            <UButton v-if="isOpen && canRecord" size="sm" variant="outline" color="neutral" icon="i-lucide-pencil" @click="detailsOpen = true">Edit details</UButton>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <UCard v-for="card in sheetCards" :key="card.label">
              <p class="text-muted text-xs font-bold uppercase tracking-wider">{{ card.label }}</p>
              <p class="text-2xl font-bold tabular-nums text-highlighted mt-1">{{ formatCents(card.entered) }}</p>
              <template v-if="card.expected !== null">
                <p class="text-toned text-sm">Sheet: {{ formatCents(card.expected) }}</p>
                <UBadge class="mt-2" variant="subtle" :color="card.entered === card.expected ? 'success' : 'warning'">
                  {{ card.entered === card.expected ? 'Matches' : `Off by ${formatCents(card.entered - card.expected)}` }}
                </UBadge>
              </template>
              <p v-else class="text-toned text-sm">{{ card.note }}</p>
            </UCard>
          </div>

          <!-- Gift entry -->
          <UCard v-if="isOpen && canRecord">
            <template #header>
              <h2 class="font-serif text-xl font-bold text-highlighted">Enter a gift</h2>
            </template>
            <UForm id="gift-form" :schema="giftSchema" :state="gift" class="space-y-4" @submit="addGift">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <UFormField label="Giver" name="giverId" class="md:col-span-1">
                  <AdminGiverPicker ref="picker" v-model="gift.giverId" />
                </UFormField>
                <UFormField label="Method" name="method">
                  <USelect v-model="gift.method" :items="giftMethodItems" class="w-full" />
                </UFormField>
                <UFormField v-if="gift.method === 'check'" label="Check number" name="checkNumber" hint="Optional">
                  <UInput v-model="checkNumber" class="w-full" />
                </UFormField>
              </div>

              <!-- Most gifts are undesignated: just an amount. -->
              <UFormField v-if="!designating" label="Amount" name="lines.0.amountCents" class="max-w-xs">
                <AdminMoneyInput v-model="gift.lines[0]!.amountCents" class="w-full" />
              </UFormField>
              <template v-else>
                <div v-for="(line, index) in gift.lines" :key="index" class="grid grid-cols-[1fr_10rem_auto] gap-x-3 gap-y-2 items-end">
                  <UFormField :label="index === 0 ? 'Given to' : undefined" :name="`lines.${index}.categoryId`">
                    <USelectMenu v-model="line.categoryId" :items="designationItems" value-key="value" class="w-full" />
                  </UFormField>
                  <UFormField :label="index === 0 ? 'Amount' : undefined" :name="`lines.${index}.amountCents`">
                    <AdminMoneyInput v-model="line.amountCents" class="w-full" />
                  </UFormField>
                  <UButton variant="ghost" color="error" icon="i-lucide-x" aria-label="Remove this line" :class="gift.lines.length > 1 ? '' : 'invisible'" @click="gift.lines.splice(index, 1)" />
                  <UFormField v-if="line.categoryId !== UNDESIGNATED" :name="`lines.${index}.memo`" class="col-span-2">
                    <UInput v-model="line.memo" icon="i-lucide-sticky-note" placeholder="Memo: what it’s for, if the category doesn’t say (optional)" class="w-full" />
                  </UFormField>
                </div>
              </template>

              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-3">
                  <template v-if="designationGroups.length">
                    <UButton v-if="!designating" variant="link" color="neutral" icon="i-lucide-tag" @click="designate">Designated gift</UButton>
                    <template v-else>
                      <UButton variant="link" color="neutral" icon="i-lucide-plus" @click="gift.lines.push({ categoryId: UNDESIGNATED, amountCents: 0, memo: null })">Add a line</UButton>
                      <UButton variant="link" color="neutral" icon="i-lucide-undo-2" @click="undesignate">All undesignated</UButton>
                    </template>
                  </template>
                  <UCheckbox v-model="differentDate" label="Received on a different date" />
                  <UInput v-if="differentDate" v-model="receivedOn" type="date" size="sm" />
                </div>
                <UButton type="submit" form="gift-form" icon="i-lucide-plus" :loading="busy">
                  Add {{ giftTotal ? formatCents(giftTotal) : 'gift' }}
                </UButton>
              </div>
            </UForm>
          </UCard>

          <!-- Gifts -->
          <section class="space-y-3">
            <h2 class="font-serif text-2xl font-bold text-highlighted">Gifts</h2>
            <UCard :ui="{ body: 'p-0 sm:p-0' }">
              <UTable :data="count.gifts" :columns="giftColumns" empty="No gifts entered yet.">
                <template #givenTo-cell="{ row }">
                  <span :class="row.original.categoryId ? 'text-highlighted' : 'text-toned'">{{ row.original.givenTo }}</span>
                  <p v-if="row.original.memo" class="text-muted text-xs">{{ row.original.memo }}</p>
                </template>
                <template #giver-cell="{ row }">
                  <span v-if="row.original.giverName" class="text-highlighted">{{ row.original.giverName }}</span>
                  <span v-else class="text-muted">Loose / anonymous</span>
                </template>
                <template #method-cell="{ row }">
                  <span class="text-toned">{{ GIFT_METHOD_LABELS[row.original.method] }}<template v-if="row.original.checkNumber"> #{{ row.original.checkNumber }}</template></span>
                </template>
                <template #receivedOn-cell="{ row }">
                  <span class="text-toned whitespace-nowrap">{{ formatDueDate(row.original.receivedOn) }}</span>
                </template>
                <template #amount-cell="{ row }">
                  <span class="tabular-nums font-semibold">{{ formatCents(row.original.amountCents) }}</span>
                </template>
                <template #actions-cell="{ row }">
                  <div v-if="isOpen && canRecord" class="flex justify-end gap-1">
                    <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" aria-label="Edit gift" @click="openGiftEditor(row.original)" />
                    <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Remove gift" @click="removeGift(row.original.id)" />
                  </div>
                </template>
              </UTable>
            </UCard>
          </section>

          <!-- Given to, deposit and notes -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UCard :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <h2 class="font-serif text-xl font-bold text-highlighted">Undesignated and designated</h2>
              </template>
              <UTable :data="count.totals.byCategory" :columns="givenToColumns" empty="Nothing entered yet.">
                <template #amount-cell="{ row }">
                  <span class="tabular-nums">{{ formatCents(row.original.amountCents) }}</span>
                </template>
                <template #givenTo-footer>
                  <span class="font-bold text-highlighted">Total</span>
                </template>
                <template #amount-footer>
                  <span class="tabular-nums font-bold text-highlighted">{{ formatCents(count.totals.totalCents) }}</span>
                </template>
              </UTable>
            </UCard>

            <UCard v-if="canView">
              <template #header>
                <h2 class="font-serif text-xl font-bold text-highlighted">Deposit</h2>
              </template>
              <div v-if="count.deposit" class="space-y-3">
                <UAlert color="success" variant="subtle" icon="i-lucide-landmark" :title="`Deposited in ${count.deposit.accountName} on ${formatDueDate(count.deposit.postedOn)}`" description="Undesignated giving went to Available to Fund; designated gifts to their categories." />
                <div class="flex gap-2">
                  <UButton :to="`/admin/stewardship/transactions?transactionId=${count.deposit.transactionId}`" variant="outline" color="neutral" size="sm" icon="i-lucide-list">Open transaction</UButton>
                  <UButton v-if="canManageBudget" variant="ghost" color="error" size="sm" icon="i-lucide-unlink" :loading="busy" @click="unlinkDeposit">Unlink</UButton>
                </div>
              </div>
              <p v-else-if="isOpen" class="text-muted text-sm">Close the count first. Then link the deposit it went into: undesignated giving goes to Available to Fund, designated gifts to their categories.</p>
              <div v-else class="space-y-3">
                <p class="text-toned text-sm">Link the bank deposit for {{ formatCents(count.totals.totalCents) }}. Undesignated giving goes to Available to Fund; designated gifts go to their categories.</p>
                <UButton v-if="canManageBudget" icon="i-lucide-link" @click="openDeposit">Link deposit</UButton>
                <p v-else class="text-muted text-xs">Linking needs permission to keep the budget.</p>
              </div>
            </UCard>

            <UCard v-if="count.notes" class="lg:col-span-2">
              <template #header>
                <h2 class="font-serif text-xl font-bold text-highlighted">Notes</h2>
              </template>
              <p class="whitespace-pre-line text-toned text-sm">{{ count.notes }}</p>
            </UCard>
          </div>
        </template>
      </div>
    </div>

    <AdminCountDetailsModal v-if="count" v-model:open="detailsOpen" :count="count" @saved="(_id: string, updated?: CountView) => updated && (count = updated)" />

    <!-- Edit a gift -->
    <UModal v-model:open="giftEditorOpen" title="Edit gift">
      <template #body>
        <UForm id="gift-edit-form" :schema="giftUpdateSchema" :state="editing" class="space-y-4" @submit="saveGift">
          <UFormField label="Giver" name="giverId">
            <AdminGiverPicker v-model="editing.giverId" :initial="editingInitial" />
          </UFormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Given to" name="categoryId">
              <USelectMenu v-model="editing.categoryId" :items="editingDesignationItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField v-if="editing.categoryId !== UNDESIGNATED" label="Memo" name="memo" hint="Optional" help="What it’s for, if the category doesn’t say.">
              <UInput v-model="editingMemo" class="w-full" />
            </UFormField>
            <UFormField label="Amount" name="amountCents">
              <AdminMoneyInput v-model="editing.amountCents" class="w-full" />
            </UFormField>
            <UFormField label="Method" name="method">
              <USelect v-model="editing.method" :items="giftMethodItems" class="w-full" />
            </UFormField>
            <UFormField v-if="editing.method === 'check'" label="Check number" name="checkNumber">
              <UInput v-model="editingCheckNumber" class="w-full" />
            </UFormField>
            <UFormField label="Received on" name="receivedOn">
              <UInput v-model="editing.receivedOn" type="date" class="w-full" />
            </UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="giftEditorOpen = false">Cancel</UButton>
        <UButton type="submit" form="gift-edit-form" :loading="busy">Save</UButton>
      </template>
    </UModal>

    <!-- Reopen -->
    <UModal v-model:open="reopenOpen" title="Reopen this count?" description="Counters can change it again, and its gifts leave statements until it is closed.">
      <template #body>
        <UForm id="reopen-form" :schema="reopenCountSchema" :state="reopen" @submit="reopenCount">
          <UFormField label="Why" name="note" help="Kept in the count’s notes." required>
            <UTextarea v-model="reopen.note" :rows="2" class="w-full" autofocus />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="reopenOpen = false">Cancel</UButton>
        <UButton type="submit" form="reopen-form" color="warning" :loading="busy">Reopen</UButton>
      </template>
    </UModal>

    <!-- Deposit -->
    <UModal v-model:open="depositOpen" title="Link the deposit" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-6">
          <section class="space-y-2">
            <h3 class="font-serif text-lg font-bold text-highlighted">From the bank</h3>
            <p class="text-toned text-sm">Deposits of exactly {{ formatCents(count?.totals.totalCents ?? 0) }} within a week of the count, not yet categorized.</p>
            <UTable :data="candidates" :columns="candidateColumns" :loading="loadingCandidates" empty="No matching deposit yet. Check the bank on the Transactions page, or record it below.">
              <template #postedOn-cell="{ row }">
                <span class="whitespace-nowrap">{{ formatDueDate(row.original.postedOn) }}</span>
              </template>
              <template #amount-cell="{ row }">
                <span class="tabular-nums">{{ formatCents(row.original.amountCents) }}</span>
              </template>
              <template #actions-cell="{ row }">
                <UButton size="xs" icon="i-lucide-link" :loading="busy" @click="linkDeposit({ mode: 'link', transactionId: row.original.id })">Link</UButton>
              </template>
            </UTable>
          </section>

          <section v-if="manualAccounts.length" class="space-y-3">
            <h3 class="font-serif text-lg font-bold text-highlighted">Or record it in a manual account</h3>
            <div class="flex flex-wrap items-end gap-3">
              <UFormField label="Account">
                <USelect v-model="record.accountId" :items="manualAccounts.map(a => ({ value: a.id, label: a.name }))" placeholder="Choose" class="w-48" />
              </UFormField>
              <UFormField label="Date">
                <UInput v-model="record.postedOn" type="date" />
              </UFormField>
              <UButton variant="outline" color="neutral" :disabled="!record.accountId" :loading="busy" @click="linkDeposit({ mode: 'record', accountId: record.accountId!, postedOn: record.postedOn })">Record deposit</UButton>
            </div>
          </section>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import { GIFT_METHOD_LABELS, giftSchema, giftUpdateSchema, reopenCountSchema, UNDESIGNATED_LABEL, type CountView, type DepositCandidate, type DesignationGroup, type GiftInput, type GiftMethod, type GiftView, type GiverSearchResult } from '#shared/giving'

definePageMeta({
  middleware: 'auth',
  permission: { giving: ['record'] },
  layout: 'default',
})

const route = useRoute()
const auth = useAuthStore()
const toast = useToast()
const canRecord = computed(() => auth.can({ giving: ['record'] }))
const canView = computed(() => auth.can({ giving: ['view'] }))
const canManage = computed(() => auth.can({ giving: ['manage'] }))
const canManageBudget = computed(() => canManage.value && auth.can({ stewardship: ['manage'] }))

const id = route.params.id as string
const { data, error } = await useFetch(`/api/admin/giving/counts/${id}`)
const count = ref<CountView | null>(data.value?.count ?? null)
watch(data, value => count.value = value?.count ?? null)
useSeoMeta({ title: () => `${count.value ? countTitle(count.value) : 'Offering count'} | Lifegate Baptist Church` })

const isOpen = computed(() => count.value?.status === 'open')

// A gift is undesignated (Available to Fund) unless it names the budget category
// it was given for. Selects can't hold null, so `undesignated` stands in.
const UNDESIGNATED = 'undesignated'
const toCategoryId = (value: string | null) => (value === UNDESIGNATED ? null : value)
const undesignatedItem = { value: UNDESIGNATED, label: `${UNDESIGNATED_LABEL} (Available to Fund)` }

const { data: designationData } = await useFetch('/api/admin/giving/designations')
const designationGroups = computed<DesignationGroup[]>(() => designationData.value?.groups ?? [])
const designationItems = computed(() => [
  [undesignatedItem],
  ...designationGroups.value.map(group => [
    { type: 'label' as const, label: group.name },
    ...group.categories.map(category => ({ value: category.id, label: category.name })),
  ]),
])
// A gift keeps its category even if that category was archived since.
const editingDesignationItems = computed(() => {
  const current = editing.categoryId
  const listed = !current || current === UNDESIGNATED || designationGroups.value.some(g => g.categories.some(c => c.id === current))
  return listed ? designationItems.value : [...designationItems.value, [{ value: current!, label: editingGivenTo.value }]]
})

const sheetCards = computed(() => {
  const c = count.value!
  return [
    { label: 'Cash', entered: c.totals.cashCents, expected: c.expectedCashCents, note: '' },
    { label: 'Checks', entered: c.totals.checkCents, expected: c.expectedCheckCents, note: '' },
    { label: 'Online and other', entered: c.totals.otherCents, expected: null, note: 'Not on the count sheet' },
    { label: 'Total', entered: c.totals.totalCents, expected: null, note: `${c.gifts.length} gift${c.gifts.length === 1 ? '' : 's'}` },
  ]
})

const giftColumns: TableColumn<GiftView>[] = [
  { id: 'giver', header: 'Giver' },
  { accessorKey: 'givenTo', header: 'Given to' },
  { id: 'method', header: 'Method' },
  { id: 'receivedOn', header: 'Received' },
  { id: 'amount', header: 'Amount', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { id: 'actions', header: '' },
]

const givenToColumns: TableColumn<CountView['totals']['byCategory'][number]>[] = [
  { accessorKey: 'givenTo', header: 'Given to', footer: 'Total' },
  { id: 'amount', header: 'Amount', footer: '', meta: { class: { th: 'text-right', td: 'text-right' } } },
]

const busy = ref(false)
const run = async (work: () => Promise<{ count: CountView }>, failure: string) => {
  busy.value = true
  try {
    count.value = (await work()).count
    return true
  }
  catch (err) {
    toast.add({ title: failure, description: apiErrorMessage(err), color: 'error' })
    return false
  }
  finally {
    busy.value = false
  }
}

// Entry: the method stays put between gifts, for fast entry from a stack.
// A gift is undesignated unless "Designated gift" is chosen.
const gift = reactive<GiftInput>({ giverId: null, method: 'check', checkNumber: null, receivedOn: null, lines: [{ categoryId: UNDESIGNATED, amountCents: 0, memo: null }] })
const designating = ref(false)
const designate = () => {
  designating.value = true
}
const undesignate = () => {
  designating.value = false
  gift.lines = [{ categoryId: UNDESIGNATED, amountCents: gift.lines.reduce((sum, line) => sum + line.amountCents, 0), memo: null }]
}
const checkNumber = computed({ get: () => gift.checkNumber ?? '', set: (v: string) => { gift.checkNumber = v || null } })
const differentDate = ref(false)
const receivedOn = ref('')
watch(differentDate, (on) => { if (on && !receivedOn.value) receivedOn.value = count.value?.countedOn ?? '' })
watch(() => gift.method, (method) => { if (method !== 'check') gift.checkNumber = null })
const giftTotal = computed(() => gift.lines.reduce((sum, line) => sum + line.amountCents, 0))
const picker = useTemplateRef<{ focus: () => void }>('picker')

const addGift = async () => {
  const body = {
    ...gift,
    // A memo goes only with a designated line.
    lines: gift.lines.map(line => ({ categoryId: toCategoryId(line.categoryId), amountCents: line.amountCents, memo: toCategoryId(line.categoryId) ? line.memo || null : null })),
    receivedOn: differentDate.value && receivedOn.value ? receivedOn.value : null,
  }
  const ok = await run(() => $fetch(`/api/admin/giving/counts/${id}/gifts`, { method: 'POST', body }), 'Gift not added')
  if (!ok) return
  Object.assign(gift, { giverId: null, checkNumber: null, lines: [{ categoryId: UNDESIGNATED, amountCents: 0, memo: null }] })
  designating.value = false
  differentDate.value = false
  nextTick(() => picker.value?.focus())
}

const removeGift = (giftId: string) =>
  run(() => $fetch(`/api/admin/giving/counts/${id}/gifts/${giftId}`, { method: 'DELETE' }), 'Gift not removed')

const giftEditorOpen = ref(false)
const editingId = ref('')
const editingInitial = ref<GiverSearchResult | null>(null)
const editingGivenTo = ref('')
const editingMemo = computed({ get: () => editing.memo ?? '', set: (v: string) => { editing.memo = v || null } })
const editing = reactive({ memo: null as string | null, giverId: null as string | null, categoryId: UNDESIGNATED as string | null, method: 'cash' as GiftMethod, checkNumber: null as string | null, receivedOn: '', amountCents: 0 })
const editingCheckNumber = computed({ get: () => editing.checkNumber ?? '', set: (v: string) => { editing.checkNumber = v || null } })
watch(() => editing.method, (method) => { if (method !== 'check') editing.checkNumber = null })
const openGiftEditor = (row: GiftView) => {
  editingId.value = row.id
  editingInitial.value = row.giverId ? { id: row.giverId, statementName: row.giverName ?? '' } : null
  editingGivenTo.value = row.givenTo
  Object.assign(editing, { memo: row.memo, giverId: row.giverId, categoryId: row.categoryId ?? UNDESIGNATED, method: row.method, checkNumber: row.checkNumber, receivedOn: row.receivedOn, amountCents: row.amountCents })
  giftEditorOpen.value = true
}
const saveGift = async () => {
  const ok = await run(() => $fetch(`/api/admin/giving/counts/${id}/gifts/${editingId.value}`, { method: 'PUT', body: { ...editing, categoryId: toCategoryId(editing.categoryId), memo: toCategoryId(editing.categoryId) ? editing.memo || null : null } }), 'Gift not saved')
  if (ok) giftEditorOpen.value = false
}

// Treasurer
const detailsOpen = ref(false)
const closeCount = () => run(() => $fetch(`/api/admin/giving/counts/${id}/close`, { method: 'POST' }), 'Count not closed')

const reopenOpen = ref(false)
const reopen = reactive({ note: '' })
const reopenCount = async () => {
  const ok = await run(() => $fetch(`/api/admin/giving/counts/${id}/reopen`, { method: 'POST', body: { note: reopen.note } }), 'Count not reopened')
  if (ok) {
    reopenOpen.value = false
    reopen.note = ''
  }
}

const depositOpen = ref(false)
const candidates = ref<DepositCandidate[]>([])
const manualAccounts = ref<Array<{ id: string, name: string }>>([])
const loadingCandidates = ref(false)
const record = reactive({ accountId: undefined as string | undefined, postedOn: '' })
const candidateColumns: TableColumn<DepositCandidate>[] = [
  { id: 'postedOn', header: 'Date' },
  { accessorKey: 'accountName', header: 'Account' },
  { accessorKey: 'description', header: 'Description' },
  { id: 'amount', header: 'Amount', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { id: 'actions', header: '' },
]
const openDeposit = async () => {
  depositOpen.value = true
  record.postedOn = count.value?.countedOn ?? todayIso()
  loadingCandidates.value = true
  try {
    const result = await $fetch(`/api/admin/giving/counts/${id}/deposit-candidates`)
    candidates.value = result.candidates
    manualAccounts.value = result.manualAccounts
  }
  catch (err) {
    toast.add({ title: 'Deposits could not be loaded', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    loadingCandidates.value = false
  }
}
const linkDeposit = async (body: { mode: 'link', transactionId: string } | { mode: 'record', accountId: string, postedOn: string }) => {
  const ok = await run(() => $fetch(`/api/admin/giving/counts/${id}/deposit`, { method: 'PUT', body }), 'Deposit not linked')
  if (ok) {
    depositOpen.value = false
    toast.add({ title: 'Deposit linked', description: 'Available to Fund and any designated categories now have this offering.', color: 'success', icon: 'i-lucide-circle-check' })
  }
}
const unlinkDeposit = () => run(() => $fetch(`/api/admin/giving/counts/${id}/deposit`, { method: 'DELETE' }), 'Deposit not unlinked')
</script>
