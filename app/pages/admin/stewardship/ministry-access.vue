<template>
  <div>
    <AdminStewardshipHeader title="Ministry access" />

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-8">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Ministry access could not be loaded.')" />

        <template v-else-if="matrix">
          <p class="text-toned max-w-3xl">
            Choose which categories each ministry can see. A ministry sees only the categories shared with it here: not other ministries' categories, and not the rest of the budget.
            <strong>Totals</strong> shows what a category was funded, spent and has left each month. <strong>Ledger</strong> adds its transactions.
            Sensitive categories can show totals only.
          </p>

          <UFormField label="Ministry" class="max-w-md">
            <USelectMenu v-model="ministryId" :items="ministryItems" value-key="value" placeholder="Choose a ministry" class="w-full" />
          </UFormField>

          <UAlert
            v-if="!matrix.groups.length"
            color="info"
            variant="subtle"
            icon="i-lucide-folder-tree"
            title="No categories yet"
            description="The Treasurer sets up categories first. Then they can be shared with ministries here."
          />

          <template v-else-if="ministryId">
            <UCard v-for="group in matrix.groups" :key="group.id" :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <h2 class="font-serif text-xl font-bold text-highlighted">{{ group.name }}</h2>
              </template>
              <UTable :data="group.categories" :columns="columns">
                <template #name-cell="{ row }">
                  <span class="text-highlighted font-semibold">{{ row.original.name }}</span>
                  <UBadge v-if="row.original.isSensitive" color="neutral" variant="subtle" icon="i-lucide-shield" class="ml-2">Sensitive</UBadge>
                </template>
                <template #level-cell="{ row }">
                  <USelect
                    :model-value="grantFor(row.original.id)?.level ?? 'none'"
                    :items="row.original.isSensitive ? sensitiveLevelItems : levelItems"
                    class="w-40"
                    :loading="savingKey === row.original.id"
                    @update:model-value="(level: Level) => saveGrant(row.original.id, level, grantFor(row.original.id)?.audience ?? 'leaders')"
                  />
                </template>
                <template #audience-cell="{ row }">
                  <USelect
                    v-if="grantFor(row.original.id)"
                    :model-value="grantFor(row.original.id)!.audience"
                    :items="audienceItems"
                    class="w-52"
                    @update:model-value="(audience: Audience) => saveGrant(row.original.id, grantFor(row.original.id)!.level, audience)"
                  />
                </template>
                <template #shared-cell="{ row }">
                  <div v-if="otherMinistries(row.original.id).length" class="flex flex-wrap gap-1">
                    <UBadge v-for="name in otherMinistries(row.original.id)" :key="name" variant="subtle" color="warning" size="sm">{{ name }}</UBadge>
                  </div>
                  <span v-else class="text-muted text-xs">No other ministry</span>
                </template>
              </UTable>
            </UCard>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { MinistryAccessAudience, MinistryAccessLevel, MinistryAccessMatrix } from '#shared/stewardship'

type Level = 'none' | MinistryAccessLevel
type Audience = MinistryAccessAudience

definePageMeta({
  middleware: 'auth',
  permission: { stewardship: ['grantAccess'] },
  layout: 'default',
})
useSeoMeta({ title: 'Ministry access | Lifegate Baptist Church' })

const toast = useToast()
const { data, error } = await useFetch('/api/admin/stewardship/ministry-access')
const matrix = ref<MinistryAccessMatrix | null>(data.value?.matrix ?? null)
watch(data, value => matrix.value = value?.matrix ?? null)

const ministryId = ref<string | undefined>()

const ministryItems = computed(() => (matrix.value?.ministries ?? []).map((m) => {
  const count = matrix.value!.grants.filter(g => g.ministryId === m.id).length
  return { value: m.id, label: m.name, suffix: count ? `${count} shared` : undefined }
}))

const levelItems = [
  { value: 'none', label: 'Not shared' },
  { value: 'totals', label: 'Totals' },
  { value: 'ledger', label: 'Ledger' },
]
const sensitiveLevelItems = levelItems.filter(item => item.value !== 'ledger')
const audienceItems = [
  { value: 'leaders', label: 'Ministry leaders' },
  { value: 'members', label: 'Everyone serving' },
]

const columns: TableColumn<MinistryAccessMatrix['groups'][number]['categories'][number]>[] = [
  { id: 'name', header: 'Category' },
  { id: 'level', header: 'Shows' },
  { id: 'audience', header: 'To' },
  { id: 'shared', header: 'Also seen by' },
]

const grantFor = (categoryId: string) =>
  matrix.value?.grants.find(g => g.ministryId === ministryId.value && g.categoryId === categoryId)

// Other ministries that can see a category, so one ministry is not given another's funds by accident.
const otherMinistries = (categoryId: string) => {
  const names = new Map((matrix.value?.ministries ?? []).map(m => [m.id, m.name]))
  return (matrix.value?.grants ?? [])
    .filter(g => g.categoryId === categoryId && g.ministryId !== ministryId.value)
    .map(g => names.get(g.ministryId) ?? '')
    .filter(Boolean)
}

const savingKey = ref<string | null>(null)
const saveGrant = async (categoryId: string, level: Level, audience: Audience) => {
  if (!ministryId.value) return
  savingKey.value = categoryId
  try {
    const result = await $fetch('/api/admin/stewardship/ministry-access', {
      method: 'PUT',
      body: { ministryId: ministryId.value, categoryId, level, audience },
    })
    matrix.value = result.matrix
  }
  catch (err) {
    toast.add({ title: 'Access not changed', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    savingKey.value = null
  }
}
</script>
