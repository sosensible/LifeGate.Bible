<template>
  <UModal v-model:open="open" :title="count ? 'Edit count details' : 'Start a count'" description="Enter the totals from the paper count sheet. The count closes when the gifts entered match them.">
    <template #body>
      <UForm id="count-form" :schema="countSchema" :state="state" class="space-y-4" @submit="save">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Date" name="countedOn" required>
            <UInput v-model="state.countedOn" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Offering name" name="label" hint="Optional" help="What was collected. A special offering has its own name.">
            <UInput v-model="label" placeholder="e.g. Sunday morning, or Missions special offering" class="w-full" />
          </UFormField>
          <UFormField label="Cash on the count sheet" name="expectedCashCents">
            <AdminMoneyInput v-model="state.expectedCashCents" class="w-full" />
          </UFormField>
          <UFormField label="Checks on the count sheet" name="expectedCheckCents">
            <AdminMoneyInput v-model="state.expectedCheckCents" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Counted by" name="counterUserIds" hint="Optional" help="Only people who are allowed to count can be chosen.">
          <USelectMenu v-model="state.counterUserIds" :items="counterItems" value-key="value" multiple searchable :loading="loadingCounters" placeholder="Choose who counted" class="w-full" />
        </UFormField>
        <!-- A count made before names were chosen has them typed in. -->
        <p v-if="legacyNames" class="text-xs text-muted -mt-2">
          Entered earlier as “{{ legacyNames }}”. Choosing people above replaces it.
        </p>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
      <UButton type="submit" form="count-form" :loading="saving">{{ count ? 'Save' : 'Start count' }}</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { countSchema, type CounterOption, type CountView } from '#shared/giving'

const props = defineProps<{ count?: CountView | null }>()
const emit = defineEmits<{ saved: [id: string, count?: CountView] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const auth = useAuthStore()
const state = reactive({ countedOn: todayIso(), label: null as string | null, expectedCashCents: 0, expectedCheckCents: 0, counterUserIds: [] as string[], notes: null as string | null })
const label = computed({ get: () => state.label ?? '', set: (v: string) => { state.label = v || null } })

// The people who may count, from the server; anyone already on this count stays in the
// list even if they have since lost the right, so editing does not drop them silently.
const { data: counterData, status: counterStatus } = useFetch<{ counters: CounterOption[] }>('/api/admin/giving/counters', { server: false, lazy: true })
const loadingCounters = computed(() => counterStatus.value === 'pending')
const counterItems = computed(() => {
  const known = new Map<string, string>()
  for (const counter of counterData.value?.counters ?? []) known.set(counter.userId, counter.name)
  for (const counter of props.count?.counters ?? []) if (!known.has(counter.userId)) known.set(counter.userId, counter.name)
  return [...known].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
})
const legacyNames = computed(() => (props.count && props.count.counterNames && !props.count.counters.length ? props.count.counterNames : null))

watch(open, (isOpen) => {
  if (!isOpen) return
  const c = props.count
  Object.assign(state, c
    ? { countedOn: c.countedOn, label: c.label, expectedCashCents: c.expectedCashCents, expectedCheckCents: c.expectedCheckCents, counterUserIds: c.counters.map(counter => counter.userId), notes: c.notes }
    : { countedOn: todayIso(), label: null, expectedCashCents: 0, expectedCheckCents: 0, counterUserIds: [], notes: null })
}, { immediate: true })

// Starting a count: the person starting it is usually one of those counting.
watch([open, counterData], () => {
  const me = auth.user?.id
  if (open.value && !props.count && me && !state.counterUserIds.length && counterData.value?.counters.some(c => c.userId === me)) state.counterUserIds = [me]
})

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    // A count that had names typed in, and is saved with none chosen, keeps them.
    const body = { countedOn: state.countedOn, label: state.label, expectedCashCents: state.expectedCashCents, expectedCheckCents: state.expectedCheckCents, ...(legacyNames.value && !state.counterUserIds.length ? {} : { counterUserIds: state.counterUserIds }) }
    if (props.count) {
      const result = await $fetch(`/api/admin/giving/counts/${props.count.id}`, { method: 'PATCH', body })
      emit('saved', props.count.id, result.count)
    }
    else {
      const { id } = await $fetch('/api/admin/giving/counts', { method: 'POST', body: { ...body, notes: null } })
      emit('saved', id)
    }
    open.value = false
  }
  catch (err) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>
