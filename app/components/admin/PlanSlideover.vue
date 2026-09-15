<template>
  <USlideover
    v-model:open="open"
    :title="editing ? `Plan for ${editing.name}` : 'Plan'"
    :description="editing ? 'What this category should be funded.' : 'Each category’s plan. Plans show what to fund each month; nothing is funded until you do.'"
    :ui="{ content: 'max-w-2xl', footer: 'justify-between' }"
  >
    <template #body>
      <!-- Every category and its plan -->
      <div v-if="!editing" class="space-y-6">
        <UEmpty v-if="!groupsWithCategories.length" icon="i-lucide-folder-tree" title="No categories yet" description="Add category groups and categories first." />
        <section v-for="group in groupsWithCategories" :key="group.id" class="space-y-2">
          <h3 class="font-serif text-lg font-bold text-highlighted">{{ group.name }}</h3>
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <UTable :data="group.categories" :columns="listColumns">
              <template #name-cell="{ row }">
                <UUser :name="row.original.name" :description="plans.get(row.original.id) ? describePlan(plans.get(row.original.id)!) : 'No plan'" />
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-1">
                  <UButton size="xs" :variant="plans.get(row.original.id) ? 'ghost' : 'outline'" :color="plans.get(row.original.id) ? 'primary' : 'neutral'" :icon="plans.get(row.original.id) ? 'i-lucide-pencil' : 'i-lucide-plus'" @click="edit(row.original)">
                    {{ plans.get(row.original.id) ? 'Edit' : 'Add plan' }}
                  </UButton>
                  <UButton v-if="plans.get(row.original.id)" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" :aria-label="`Remove the plan for ${row.original.name}`" @click="remove(row.original)" />
                </div>
              </template>
            </UTable>
          </UCard>
        </section>
      </div>

      <!-- One category's plan -->
      <UForm v-else id="plan-form" :state="state" class="space-y-6" @submit="save">
        <UFormField label="Based on" name="source">
          <URadioGroup
            v-model="state.source"
            :items="[
              { value: 'custom', label: 'An amount I choose' },
              { value: 'recurring', label: 'This category’s recurring bills', description: 'Needs what its recurring transactions (set to feed the plan) will cost.' },
            ]"
          />
        </UFormField>

        <template v-if="state.source === 'custom'">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Plan" name="kind">
              <URadioGroup
                v-model="state.kind"
                :items="[
                  { value: 'fillUpTo', label: 'Fill up to', description: 'Top the category up to the amount.' },
                  { value: 'add', label: 'Add', description: 'Set the amount aside, whatever is already there.' },
                ]"
              />
            </UFormField>
            <UFormField label="Amount" name="amountCents" required>
              <AdminMoneyInput v-model="state.amountCents" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="When" name="cadence">
            <URadioGroup v-model="state.cadence" orientation="horizontal" :items="[{ value: 'monthly', label: 'Monthly' }, { value: 'byDate', label: 'By a date' }]" />
          </UFormField>

          <UCard v-if="state.cadence === 'byDate'">
            <div class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormField label="Date" name="dueOn" required>
                  <UInput v-model="state.dueOn" type="date" class="w-full" />
                </UFormField>
                <UFormField label="Repeats" name="repeat">
                  <USelect v-model="state.repeat" :items="repeatItems" class="w-full" />
                </UFormField>
              </div>
              <UFormField label="Funded" name="deadline">
                <URadioGroup
                  v-model="state.deadline"
                  :items="[
                    { value: 'byMonth', label: 'By the month', description: 'All of it in the category before the due month starts.' },
                    { value: 'byDate', label: 'By the date', description: 'The due month counts as a month to fund in.' },
                  ]"
                />
              </UFormField>
              <UAlert v-if="category && !category.rollover" color="warning" variant="subtle" icon="i-lucide-rotate-ccw" :description="`${category.name} resets each month. A dated plan sets money aside, so it will be switched to roll over.`" />
            </div>
          </UCard>
        </template>

        <UFormField label="Starting" name="startMonth">
          <USelectMenu v-model="state.startMonth" :items="startItems" value-key="value" :search-input="false" class="w-full sm:w-64" />
        </UFormField>

        <UAlert v-if="estimate" color="info" variant="subtle" icon="i-lucide-calculator" :description="estimate" />
      </UForm>
    </template>

    <template #footer>
      <template v-if="editing">
        <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" @click="editing = null">All categories</UButton>
        <UButton type="submit" form="plan-form" :loading="saving">Save plan</UButton>
      </template>
      <template v-else>
        <span />
        <UButton color="neutral" variant="outline" @click="open = false">Done</UButton>
      </template>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import { addMonths, currentMonth, monthLabel, PLAN_REPEAT_LABELS, PLAN_REPEATS, type CategoryGroupView, type CategoryView, type PlanInput, type PlanView } from '#shared/stewardship'

// `categoryId` opens straight to that category's plan (from a budget row).
const props = defineProps<{ month: string, categoryId?: string | null }>()
const emit = defineEmits<{ changed: [] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const { data: groupData, refresh: refreshGroups } = useFetch('/api/admin/stewardship/category-groups', { lazy: true, server: false, immediate: false })
const { data: planData, refresh: refreshPlans } = useFetch('/api/admin/stewardship/plans', { lazy: true, server: false, immediate: false })
watch(open, async (isOpen) => {
  if (!isOpen) return
  editing.value = null
  await Promise.all([refreshGroups(), refreshPlans()])
  const target = props.categoryId && groupsWithCategories.value.flatMap(g => g.categories).find(c => c.id === props.categoryId)
  if (target) edit(target)
})

const groupsWithCategories = computed(() => ((groupData.value?.groups ?? []) as CategoryGroupView[])
  .filter(g => !g.archivedAt)
  .map(g => ({ ...g, categories: g.categories.filter(c => c.kind === 'spending' && !c.archivedAt) }))
  .filter(g => g.categories.length))
const plans = computed(() => new Map(((planData.value?.plans ?? []) as PlanView[]).map(p => [p.categoryId, p])))

const listColumns: TableColumn<CategoryView>[] = [
  { id: 'name', header: 'Category' },
  { id: 'actions', header: '' },
]
const repeatItems = PLAN_REPEATS.map(value => ({ value, label: PLAN_REPEAT_LABELS[value] }))

const editing = ref<CategoryView | null>(null)
const category = computed(() => editing.value)
const blank = (): PlanInput => ({ source: 'custom', kind: 'fillUpTo', cadence: 'monthly', amountCents: 0, dueOn: null, deadline: 'byDate', repeat: 'none', startMonth: props.month })
const state = reactive<PlanInput>(blank())

const startItems = computed(() => Array.from({ length: 25 }, (_, i) => addMonths(currentMonth(), i - 12)).map(value => ({ value, label: monthLabel(value) })))

const edit = (target: CategoryView) => {
  const existing = plans.value.get(target.id)
  Object.assign(state, existing ? { ...existing, dueOn: existing.dueOn } : blank())
  editing.value = target
}

// A rough preview of the monthly amount, before anything is funded.
const estimate = computed(() => {
  if (state.source === 'recurring') return 'Each month needs what its recurring bills cost; quarterly and yearly bills are set aside evenly until they are due.'
  if (state.amountCents <= 0) return null
  if (state.cadence === 'monthly') return `Needs ${formatCents(state.amountCents)} a month${state.kind === 'fillUpTo' ? ', less what is already in the category' : ''}.`
  if (!state.dueOn) return null
  const dueMonth = state.dueOn.slice(0, 7)
  let months = 0
  for (let m = state.startMonth; m < dueMonth || (state.deadline === 'byDate' && m === dueMonth); m = addMonths(m, 1)) months++
  if (months <= 0) return 'The date is too soon: there are no months left to fund it in.'
  const last = state.deadline === 'byMonth' ? monthLabel(addMonths(dueMonth, -1)) : monthLabel(dueMonth)
  return `Needs about ${formatCents(Math.ceil(state.amountCents / months))} a month from ${monthLabel(state.startMonth)} through ${last}${state.kind === 'fillUpTo' ? ', less what is already in the category' : ''}.`
})

const saving = ref(false)
const save = async () => {
  const target = editing.value
  if (!target) return
  saving.value = true
  try {
    const needsRollover = state.source === 'custom' && state.cadence === 'byDate' && !target.rollover
    const { switchedRollover } = await $fetch(`/api/admin/stewardship/plans/${target.id}`, {
      method: 'PUT',
      body: { ...state, switchToRollover: needsRollover },
    })
    await refreshPlans()
    if (switchedRollover) await refreshGroups()
    toast.add({ title: 'Plan saved', description: switchedRollover ? `${target.name} now rolls over.` : undefined, color: 'success', icon: 'i-lucide-circle-check' })
    editing.value = null
    emit('changed')
  }
  catch (err) {
    toast.add({ title: 'Plan not saved', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const remove = async (target: CategoryView) => {
  try {
    await $fetch(`/api/admin/stewardship/plans/${target.id}`, { method: 'DELETE' })
    await refreshPlans()
    emit('changed')
  }
  catch (err) {
    toast.add({ title: 'Plan not removed', description: apiErrorMessage(err), color: 'error' })
  }
}
</script>
