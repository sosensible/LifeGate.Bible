<template>
  <USlideover v-model:open="open" :title="household ? 'Edit household' : 'Add a household'" :description="previewName" :ui="{ content: 'max-w-xl', footer: 'justify-between' }">
    <template #body>
      <div class="space-y-8">
        <UAlert
          v-if="household?.problems.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Needs setup"
          :description="household.problems.join('. ')"
        />

        <!-- Who runs the house -->
        <section class="space-y-4">
          <UFormField label="Who runs the house">
            <URadioGroup v-model="kind" :items="kindItems" />
          </UFormField>

          <template v-if="kind === 'married'">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField label="Husband" required>
                <USelectMenu v-model="husbandId" :items="adultItems(husbandId)" value-key="value" placeholder="Choose a person" class="w-full" />
              </UFormField>
              <UFormField label="Wife" required>
                <USelectMenu v-model="wifeId" :items="adultItems(wifeId)" value-key="value" placeholder="Choose a person" class="w-full" />
              </UFormField>
            </div>
            <UFormField label="To the children, they are">
              <URadioGroup v-model="marriedRelationship" orientation="horizontal" :items="[{ value: 'family', label: 'Father and mother' }, { value: 'guardian', label: 'Guardians' }]" />
            </UFormField>
          </template>

          <template v-else-if="kind === 'singleParent'">
            <UFormField label="Adult" required>
              <USelectMenu v-model="adultId" :items="adultItems(adultId)" value-key="value" placeholder="Choose a person" class="w-full" />
            </UFormField>
            <UFormField label="To the children, they are" required>
              <URadioGroup v-model="singleRole" orientation="horizontal" :items="[{ value: 'father', label: 'Father' }, { value: 'mother', label: 'Mother' }, { value: 'guardian', label: 'Guardian' }]" />
            </UFormField>
          </template>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Guardian" required>
              <USelectMenu v-model="guardianIds[0]" :items="adultItems(guardianIds[0])" value-key="value" placeholder="Choose a person" class="w-full" />
            </UFormField>
            <UFormField label="Guardian" required>
              <USelectMenu v-model="guardianIds[1]" :items="adultItems(guardianIds[1])" value-key="value" placeholder="Choose a person" class="w-full" />
            </UFormField>
          </div>
          <p class="text-muted text-xs">People marked under 18, or already in another household, cannot be chosen.</p>
        </section>

        <!-- Children -->
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-serif text-lg font-bold text-highlighted">Children</h3>
            <p v-if="kind !== 'married'" class="text-muted text-xs">At least one child</p>
          </div>
          <ul v-if="childIds.length" class="divide-y divide-default border border-default rounded-md">
            <li v-for="(childId, index) in childIds" :key="childId" class="flex items-center justify-between px-3 py-2 text-sm">
              <span class="text-highlighted">{{ personLabel(childId) }}</span>
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" :aria-label="`Remove ${personLabel(childId)}`" @click="childIds.splice(index, 1)" />
            </li>
          </ul>
          <USelectMenu
            :model-value="undefined"
            :items="childItems"
            value-key="value"
            placeholder="Add a child"
            icon="i-lucide-plus"
            class="w-full"
            @update:model-value="addChild"
          />
        </section>

        <!-- Name -->
        <section class="space-y-3">
          <USwitch v-model="useCustomName" label="Use a different name" :description="`Otherwise: ${generatedName ?? 'set once the adults are chosen'}`" />
          <UInput v-if="useCustomName" v-model="customName" placeholder="Household name" class="w-full" />
        </section>
      </div>
    </template>

    <template #footer>
      <UButton v-if="household" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmingDelete = true">Remove</UButton>
      <span v-else />
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton :loading="saving" @click="save">{{ household ? 'Save' : 'Add household' }}</UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="confirmingDelete" title="Remove this household?" :description="household ? `${household.name} will be removed. Its people are kept, with no household.` : ''">
    <template #footer>
      <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep</UButton>
      <UButton color="error" :loading="deleting" @click="remove">Remove</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import {
  HOUSEHOLD_KIND_LABELS,
  householdName,
  type HouseholdKind,
  type HouseholdRelationship,
  type HouseholdRole,
  type HouseholdView,
} from '#shared/households'
import type { AdminPersonView } from '#shared/people'

const props = defineProps<{
  household: HouseholdView | null
  people: AdminPersonView[]
}>()

const emit = defineEmits<{ saved: [household: HouseholdView], removed: [id: string] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const kindItems = (Object.keys(HOUSEHOLD_KIND_LABELS) as HouseholdKind[]).map(value => ({ value, label: HOUSEHOLD_KIND_LABELS[value] }))

const kind = ref<HouseholdKind>('married')
const husbandId = ref<string | undefined>()
const wifeId = ref<string | undefined>()
const marriedRelationship = ref<HouseholdRelationship>('family')
const adultId = ref<string | undefined>()
const singleRole = ref<'father' | 'mother' | 'guardian' | undefined>()
const guardianIds = ref<[string | undefined, string | undefined]>([undefined, undefined])
const childIds = ref<string[]>([])
const useCustomName = ref(false)
const customName = ref('')

const load = () => {
  const h = props.household
  const withRole = (...roles: HouseholdRole[]) => (h?.adults ?? []).filter(a => a.role && roles.includes(a.role))
  kind.value = h?.kind ?? 'married'
  husbandId.value = withRole('husband')[0]?.personId
  wifeId.value = withRole('wife')[0]?.personId
  marriedRelationship.value = h?.relationship ?? 'family'
  const single = withRole('father', 'mother', 'guardian')[0]
  adultId.value = h?.kind === 'singleParent' ? single?.personId : undefined
  singleRole.value = h?.kind === 'singleParent' ? single?.role as 'father' | 'mother' | 'guardian' | undefined : undefined
  const guardians = withRole('guardian')
  guardianIds.value = h?.kind === 'guardians' ? [guardians[0]?.personId, guardians[1]?.personId] : [undefined, undefined]
  childIds.value = (h?.children ?? []).map(c => c.personId)
  useCustomName.value = h?.nameIsCustom ?? false
  customName.value = h?.nameIsCustom ? h.name : ''
}
watch(open, (isOpen) => {
  if (isOpen) load()
}, { immediate: true })

const byId = computed(() => new Map(props.people.map(p => [p.id, p])))
const personLabel = (id: string) => {
  const p = byId.value.get(id)
  return p ? `${p.firstName} ${p.lastName}` : 'Removed person'
}

// The adults for the chosen kind, with their roles.
const adults = computed<Array<{ id: string | undefined, role: HouseholdRole }>>(() => {
  if (kind.value === 'married') return [{ id: husbandId.value, role: 'husband' }, { id: wifeId.value, role: 'wife' }]
  if (kind.value === 'singleParent') return [{ id: adultId.value, role: singleRole.value ?? 'guardian' }]
  return guardianIds.value.map(id => ({ id, role: 'guardian' as const }))
})

const chosen = computed(() => new Set([...adults.value.map(a => a.id), ...childIds.value].filter(Boolean) as string[]))
const inOtherHousehold = (p: AdminPersonView) => Boolean(p.householdId && p.householdId !== props.household?.id)

const option = (p: AdminPersonView, disabled: boolean) => ({
  value: p.id,
  label: `${p.lastName}, ${p.firstName}`,
  description: inOtherHousehold(p) ? p.householdName ?? 'In another household' : p.isMinor ? 'Under 18' : undefined,
  disabled,
})

const adultItems = (current: string | undefined) =>
  props.people.map(p => option(p, p.isMinor || inOtherHousehold(p) || (chosen.value.has(p.id) && p.id !== current)))

const childItems = computed(() =>
  props.people.filter(p => !chosen.value.has(p.id)).map(p => option(p, inOtherHousehold(p))))

const addChild = (personId: string | undefined) => {
  if (personId) childIds.value.push(personId)
}

const generatedName = computed(() => {
  const people = adults.value.map(a => a.id && byId.value.get(a.id) ? { ...byId.value.get(a.id)!, role: a.role } : null)
  return people.every(Boolean) ? householdName(kind.value, people as NonNullable<typeof people[number]>[]) : null
})
const previewName = computed(() => (useCustomName.value && customName.value.trim()) || generatedName.value || undefined)

const saving = ref(false)
const save = async () => {
  const shared = { childIds: childIds.value, customName: useCustomName.value ? customName.value.trim() || null : null }
  const body = kind.value === 'married'
    ? { kind: 'married', husbandId: husbandId.value, wifeId: wifeId.value, relationship: marriedRelationship.value, ...shared }
    : kind.value === 'singleParent'
      ? { kind: 'singleParent', adultId: adultId.value, role: singleRole.value, ...shared }
      : { kind: 'guardians', guardianIds: guardianIds.value, ...shared }

  saving.value = true
  try {
    const { household } = await $fetch<{ household: HouseholdView }>(
      props.household ? `/api/admin/households/${props.household.id}` : '/api/admin/households',
      { method: props.household ? 'PUT' : 'POST', body },
    )
    emit('saved', household)
    toast.add({ title: props.household ? 'Household saved' : `${household.name} added`, color: 'success', icon: 'i-lucide-circle-check' })
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: validationMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = false
  }
}

// The server's message, or the first validation issue in plain words.
const validationMessage = (error: unknown) => {
  const issues = (error as { data?: { data?: Array<{ message?: string, path?: unknown[] }> } })?.data?.data
  if (Array.isArray(issues) && issues[0]) {
    const path = issues[0].path?.join('.') ?? ''
    if (/husbandId|wifeId|adultId|guardianIds/.test(path)) return 'Choose every adult for this household.'
    return issues[0].message ?? 'Check the household and try again.'
  }
  return apiErrorMessage(error)
}

const confirmingDelete = ref(false)
const deleting = ref(false)
const remove = async () => {
  if (!props.household) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/households/${props.household.id}`, { method: 'DELETE' })
    emit('removed', props.household.id)
    toast.add({ title: 'Household removed', color: 'success' })
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
