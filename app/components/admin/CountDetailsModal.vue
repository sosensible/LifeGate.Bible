<template>
  <UModal v-model:open="open" :title="count ? 'Edit count details' : 'Start a count'" description="Enter the totals from the paper count sheet. The count closes when the gifts entered match them.">
    <template #body>
      <UForm id="count-form" :schema="countSchema" :state="state" class="space-y-4" @submit="save">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Date" name="countedOn" required>
            <UInput v-model="state.countedOn" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Service" name="label" hint="Optional">
            <UInput v-model="label" placeholder="e.g. Sunday morning" class="w-full" />
          </UFormField>
          <UFormField label="Cash on the count sheet" name="expectedCashCents">
            <AdminMoneyInput v-model="state.expectedCashCents" class="w-full" />
          </UFormField>
          <UFormField label="Checks on the count sheet" name="expectedCheckCents">
            <AdminMoneyInput v-model="state.expectedCheckCents" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Counted by" name="counterNames" hint="Optional">
          <UInput v-model="counterNames" placeholder="e.g. two deacons’ names" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
      <UButton type="submit" form="count-form" :loading="saving">{{ count ? 'Save' : 'Start count' }}</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { countSchema, type CountView } from '#shared/giving'

const props = defineProps<{ count?: CountView | null }>()
const emit = defineEmits<{ saved: [id: string, count?: CountView] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const state = reactive({ countedOn: todayIso(), label: null as string | null, expectedCashCents: 0, expectedCheckCents: 0, counterNames: null as string | null, notes: null as string | null })
const label = computed({ get: () => state.label ?? '', set: (v: string) => { state.label = v || null } })
const counterNames = computed({ get: () => state.counterNames ?? '', set: (v: string) => { state.counterNames = v || null } })

watch(open, (isOpen) => {
  if (!isOpen) return
  const c = props.count
  Object.assign(state, c
    ? { countedOn: c.countedOn, label: c.label, expectedCashCents: c.expectedCashCents, expectedCheckCents: c.expectedCheckCents, counterNames: c.counterNames, notes: c.notes }
    : { countedOn: todayIso(), label: null, expectedCashCents: 0, expectedCheckCents: 0, counterNames: null, notes: null })
}, { immediate: true })

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const body = { countedOn: state.countedOn, label: state.label, expectedCashCents: state.expectedCashCents, expectedCheckCents: state.expectedCheckCents, counterNames: state.counterNames }
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
