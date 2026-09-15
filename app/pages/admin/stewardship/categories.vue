<template>
  <div>
    <AdminStewardshipHeader title="Categories" />

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-8">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Categories could not be loaded.')" />

        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 class="font-serif text-2xl font-bold text-highlighted">Category groups</h2>
            <p class="text-toned text-sm max-w-2xl">Groups organize the budget and are the sections of the semi-annual reports. Add a group, then add its categories.</p>
          </div>
          <div class="flex items-center gap-4">
            <USwitch v-model="showArchived" label="Show archived" />
            <UButton v-if="canManage" icon="i-lucide-folder-plus" @click="openGroupEditor(null)">Add category group</UButton>
          </div>
        </div>

        <UCard v-for="(group, groupIndex) in visibleGroups" :key="group.id" :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <h2 class="font-serif text-xl font-bold text-highlighted">{{ group.name }}</h2>
                <UBadge v-if="group.archivedAt" color="warning" variant="subtle">Archived</UBadge>
              </div>
              <div v-if="canManage" class="flex gap-1">
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-arrow-up" :disabled="groupIndex === 0" :aria-label="`Move ${group.name} up`" @click="moveGroup(groupIndex, -1)" />
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-arrow-down" :disabled="groupIndex === visibleGroups.length - 1" :aria-label="`Move ${group.name} down`" @click="moveGroup(groupIndex, 1)" />
                <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${group.name}`" @click="openGroupEditor(group)" />
                <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-plus" @click="openCategoryEditor(null, group.id)">Category</UButton>
              </div>
            </div>
          </template>

          <UTable :data="categoriesIn(group)" :columns="columns" empty="No categories in this group.">
            <template #name-cell="{ row }">
              <span class="text-highlighted font-semibold">{{ row.original.name }}</span>
              <UBadge v-if="row.original.kind === 'availableToFund'" color="primary" variant="subtle" class="ml-2">Income</UBadge>
              <UBadge v-if="row.original.archivedAt" color="warning" variant="subtle" class="ml-2">Archived</UBadge>
            </template>
            <template #rollover-cell="{ row }">
              <span v-if="row.original.kind === 'spending'" class="text-toned">{{ row.original.rollover ? 'Rolls over' : 'Resets monthly' }}</span>
            </template>
            <template #sensitive-cell="{ row }">
              <UBadge v-if="row.original.isSensitive" color="neutral" variant="subtle" icon="i-lucide-shield">Sensitive</UBadge>
            </template>
            <template #actions-cell="{ row }">
              <div v-if="canManage && row.original.kind === 'spending'" class="flex justify-end gap-1">
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-arrow-up" :disabled="row.index === 0" :aria-label="`Move ${row.original.name} up`" @click="moveCategory(group, row.index, -1)" />
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-arrow-down" :disabled="row.index === categoriesIn(group).length - 1" :aria-label="`Move ${row.original.name} down`" @click="moveCategory(group, row.index, 1)" />
                <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${row.original.name}`" @click="openCategoryEditor(row.original, group.id)" />
              </div>
            </template>
          </UTable>
        </UCard>

        <!-- Payee rules -->
        <section v-if="canManage" class="space-y-3">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="font-serif text-2xl font-bold text-highlighted">Payee rules</h2>
              <p class="text-toned text-sm">New bank transactions whose description contains the text get the payee and category. The first matching rule wins.</p>
            </div>
            <UButton variant="outline" color="neutral" icon="i-lucide-plus" @click="openRuleEditor(null)">Add rule</UButton>
          </div>
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <UTable :data="rules" :columns="ruleColumns" empty="No rules yet. You can also make one from a transaction.">
              <template #matchText-cell="{ row }">
                <UKbd>{{ row.original.matchText }}</UKbd>
              </template>
              <template #payee-cell="{ row }">
                <span class="text-toned">{{ row.original.payee ?? 'Leave as is' }}</span>
              </template>
              <template #category-cell="{ row }">
                <span class="text-toned">{{ row.original.categoryName ?? 'Leave as is' }}</span>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-1">
                  <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" aria-label="Edit rule" @click="openRuleEditor(row.original)" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Remove rule" @click="removeRule(row.original.id)" />
                </div>
              </template>
            </UTable>
          </UCard>
        </section>
      </div>
    </div>

    <!-- Group editor -->
    <UModal v-model:open="groupEditorOpen" :title="editingGroup ? `Edit ${editingGroup.name}` : 'Add a category group'">
      <template #body>
        <UForm id="group-form" :schema="categoryGroupSchema" :state="groupState" class="space-y-4" @submit="saveGroup">
          <UFormField label="Name" name="name" required>
            <UInput v-model="groupState.name" class="w-full" autofocus />
          </UFormField>
          <USwitch v-if="editingGroup" v-model="groupState.archived" label="Archived" description="Hidden from the budget once its categories are empty." />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-between">
          <UButton v-if="editingGroup" color="error" variant="ghost" icon="i-lucide-trash-2" :loading="busy" @click="removeGroup">Remove</UButton>
          <div class="flex gap-2 ml-auto">
            <UButton color="neutral" variant="outline" @click="groupEditorOpen = false">Cancel</UButton>
            <UButton type="submit" form="group-form" :loading="busy">{{ editingGroup ? 'Save' : 'Add group' }}</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Category editor -->
    <UModal v-model:open="categoryEditorOpen" :title="editingCategory ? `Edit ${editingCategory.name}` : 'Add a category'">
      <template #body>
        <UForm id="category-form" :schema="categorySchema" :state="categoryState" class="space-y-4" @submit="saveCategory">
          <UFormField label="Name" name="name" required>
            <UInput v-model="categoryState.name" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Group" name="groupId" required>
            <USelect v-model="categoryState.groupId" :items="groupItems" class="w-full" />
          </UFormField>
          <UFormField label="At the end of the month" name="rollover">
            <URadioGroup
              v-model="rolloverChoice"
              :items="[
                { value: 'rollover', label: 'Roll over', description: 'What is left stays in this category.' },
                { value: 'reset', label: 'Reset', description: 'What is left (or overspent) returns to Available to Fund.' },
              ]"
            />
          </UFormField>
          <USwitch v-model="categoryState.isSensitive" label="Sensitive" description="Transactions can name people helped (e.g. Benevolence). Ministries see totals only." />
          <USwitch v-if="editingCategory" v-model="categoryState.archived" label="Archived" description="Hidden from choices. Its history stays in the budget." />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-between">
          <UButton v-if="editingCategory" color="error" variant="ghost" icon="i-lucide-trash-2" :loading="busy" @click="removeCategory">Remove</UButton>
          <div class="flex gap-2 ml-auto">
            <UButton color="neutral" variant="outline" @click="categoryEditorOpen = false">Cancel</UButton>
            <UButton type="submit" form="category-form" :loading="busy">{{ editingCategory ? 'Save' : 'Add category' }}</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Rule editor -->
    <UModal v-model:open="ruleEditorOpen" :title="editingRule ? 'Edit rule' : 'Add a payee rule'">
      <template #body>
        <UForm id="rule-form" :schema="payeeRuleSchema" :state="ruleState" class="space-y-4" @submit="saveRule">
          <UFormField label="When the bank description contains" name="matchText" required>
            <UInput v-model="ruleState.matchText" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Set the payee to" name="payee">
            <UInput v-model="ruleState.payee" placeholder="Leave as is" class="w-full" />
          </UFormField>
          <UFormField label="Set the category to" name="categoryId">
            <USelectMenu v-model="ruleState.categoryId" :items="categoryItems" value-key="value" placeholder="Leave as is" clear class="w-full" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="ruleEditorOpen = false">Cancel</UButton>
        <UButton type="submit" form="rule-form" :loading="busy">{{ editingRule ? 'Save' : 'Add rule' }}</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { categoryGroupSchema, categorySchema, payeeRuleSchema, type CategoryGroupView, type CategoryView, type PayeeRuleView } from '#shared/stewardship'

definePageMeta({
  middleware: 'auth',
  permission: { stewardship: ['view'] },
  layout: 'default',
})
useSeoMeta({ title: 'Categories | Lifegate Baptist Church' })

const auth = useAuthStore()
const toast = useToast()
const canManage = computed(() => auth.can({ stewardship: ['manage'] }))

const { data, error, refresh } = await useFetch('/api/admin/stewardship/category-groups')
const { data: ruleData, refresh: refreshRules } = await useFetch('/api/admin/stewardship/rules', { immediate: canManage.value })

const groups = ref<CategoryGroupView[]>(data.value?.groups ?? [])
watch(data, value => groups.value = value?.groups ?? [])
const rules = computed<PayeeRuleView[]>(() => ruleData.value?.rules ?? [])

const showArchived = ref(false)
const visibleGroups = computed(() => groups.value.filter(g => showArchived.value || !g.archivedAt))
const categoriesIn = (group: CategoryGroupView) => group.categories.filter(c => showArchived.value || !c.archivedAt)
const groupItems = computed(() => groups.value.filter(g => !g.archivedAt).map(g => ({ value: g.id, label: g.name })))
const categoryItems = computed(() => categoryMenuItems(groups.value))

const columns: TableColumn<CategoryView>[] = [
  { id: 'name', header: 'Category' },
  { id: 'rollover', header: 'Month end' },
  { id: 'sensitive', header: '' },
  { id: 'actions', header: '' },
]
const ruleColumns: TableColumn<PayeeRuleView>[] = [
  { id: 'matchText', header: 'Description contains' },
  { id: 'payee', header: 'Payee' },
  { id: 'category', header: 'Category' },
  { id: 'actions', header: '' },
]

const busy = ref(false)
const run = async (work: () => Promise<unknown>, failure: string) => {
  busy.value = true
  try {
    await work()
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

// Groups
const groupEditorOpen = ref(false)
const editingGroup = ref<CategoryGroupView | null>(null)
const groupState = reactive({ name: '', archived: false })
const openGroupEditor = (group: CategoryGroupView | null) => {
  editingGroup.value = group
  Object.assign(groupState, { name: group?.name ?? '', archived: Boolean(group?.archivedAt) })
  groupEditorOpen.value = true
}
const saveGroup = async () => {
  const group = editingGroup.value
  const ok = await run(async () => {
    const result = group
      ? await $fetch(`/api/admin/stewardship/category-groups/${group.id}`, { method: 'PATCH', body: { name: groupState.name, archived: groupState.archived } })
      : await $fetch('/api/admin/stewardship/category-groups', { method: 'POST', body: { name: groupState.name } })
    groups.value = result.groups
  }, 'Group not saved')
  if (ok) groupEditorOpen.value = false
}
const removeGroup = async () => {
  const group = editingGroup.value
  if (!group) return
  const ok = await run(() => $fetch(`/api/admin/stewardship/category-groups/${group.id}`, { method: 'DELETE' }), 'Group not removed')
  if (ok) {
    groupEditorOpen.value = false
    await refresh()
  }
}

// Categories
const categoryEditorOpen = ref(false)
const editingCategory = ref<CategoryView | null>(null)
const categoryState = reactive({ name: '', groupId: '', rollover: true, isSensitive: false, archived: false })
const rolloverChoice = computed({
  get: () => (categoryState.rollover ? 'rollover' : 'reset'),
  set: (value: string) => { categoryState.rollover = value === 'rollover' },
})
const openCategoryEditor = (category: CategoryView | null, groupId: string) => {
  editingCategory.value = category
  Object.assign(categoryState, category
    ? { name: category.name, groupId: category.groupId, rollover: category.rollover, isSensitive: category.isSensitive, archived: Boolean(category.archivedAt) }
    : { name: '', groupId, rollover: true, isSensitive: false, archived: false })
  categoryEditorOpen.value = true
}
const saveCategory = async () => {
  const category = editingCategory.value
  const body = { name: categoryState.name, groupId: categoryState.groupId, rollover: categoryState.rollover, isSensitive: categoryState.isSensitive }
  const ok = await run(async () => {
    const result = category
      ? await $fetch(`/api/admin/stewardship/categories/${category.id}`, { method: 'PATCH', body: { ...body, archived: categoryState.archived } })
      : await $fetch('/api/admin/stewardship/categories', { method: 'POST', body })
    groups.value = result.groups
  }, 'Category not saved')
  if (ok) categoryEditorOpen.value = false
}
const removeCategory = async () => {
  const category = editingCategory.value
  if (!category) return
  const ok = await run(() => $fetch(`/api/admin/stewardship/categories/${category.id}`, { method: 'DELETE' }), 'Category not removed')
  if (ok) {
    categoryEditorOpen.value = false
    await refresh()
  }
}

// Order: save the new position of everything that moved.
const moveGroup = (index: number, step: number) => run(async () => {
  const order = [...visibleGroups.value]
  order.splice(index + step, 0, ...order.splice(index, 1))
  for (const [sortOrder, group] of order.entries()) {
    if (group.sortOrder !== sortOrder) await $fetch(`/api/admin/stewardship/category-groups/${group.id}`, { method: 'PATCH', body: { sortOrder } })
  }
  await refresh()
}, 'Not moved')

const moveCategory = (group: CategoryGroupView, index: number, step: number) => run(async () => {
  const order = [...categoriesIn(group)]
  order.splice(index + step, 0, ...order.splice(index, 1))
  for (const [sortOrder, category] of order.entries()) {
    if (category.sortOrder !== sortOrder && category.kind === 'spending') {
      await $fetch(`/api/admin/stewardship/categories/${category.id}`, { method: 'PATCH', body: { sortOrder } })
    }
  }
  await refresh()
}, 'Not moved')

// Rules
const ruleEditorOpen = ref(false)
const editingRule = ref<PayeeRuleView | null>(null)
const ruleState = reactive({ matchText: '', payee: '', categoryId: null as string | null })
const openRuleEditor = (rule: PayeeRuleView | null) => {
  editingRule.value = rule
  Object.assign(ruleState, { matchText: rule?.matchText ?? '', payee: rule?.payee ?? '', categoryId: rule?.categoryId ?? null })
  ruleEditorOpen.value = true
}
const saveRule = async () => {
  const rule = editingRule.value
  const body = { matchText: ruleState.matchText, payee: ruleState.payee, categoryId: ruleState.categoryId }
  const ok = await run(() => rule
    ? $fetch(`/api/admin/stewardship/rules/${rule.id}`, { method: 'PATCH', body })
    : $fetch('/api/admin/stewardship/rules', { method: 'POST', body }), 'Rule not saved')
  if (ok) {
    ruleEditorOpen.value = false
    await refreshRules()
  }
}
const removeRule = async (id: string) => {
  if (await run(() => $fetch(`/api/admin/stewardship/rules/${id}`, { method: 'DELETE' }), 'Rule not removed')) await refreshRules()
}
</script>
