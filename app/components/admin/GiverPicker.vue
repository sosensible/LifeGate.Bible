<template>
  <USelectMenu
    ref="menu"
    v-model="selected"
    v-model:search-term="searchTerm"
    :items="items"
    value-key="value"
    ignore-filter
    create-item="always"
    :search-input="{ placeholder: 'Search by name...', loading: searching }"
    placeholder="Choose the giver"
    icon="i-lucide-user-round"
    class="w-full"
    @create="quickAdd"
    @update:open="(isOpen: boolean) => isOpen && search()"
  >
    <template #create-item-label="{ item }">
      Add “{{ item }}” as a new giver
    </template>
  </USelectMenu>
</template>

<script setup lang="ts">
// Picks a giver by name for a gift, or "Loose / anonymous". Counters see names
// only; a name that isn't found can be added on the spot.
import type { GiverSearchResult } from '#shared/giving'

// `loose` stands in for no giver.
const LOOSE = 'loose'

const model = defineModel<string | null>({ required: true })
const props = defineProps<{ initial?: GiverSearchResult | null }>()
const toast = useToast()

const results = ref<GiverSearchResult[]>(props.initial ? [props.initial] : [])
const known = ref(new Map<string, string>(props.initial ? [[props.initial.id, props.initial.statementName]] : []))
const searchTerm = ref('')
const searching = ref(false)

const selected = computed({
  get: () => model.value ?? LOOSE,
  set: (value: string) => { model.value = value === LOOSE ? null : value },
})

const items = computed(() => {
  const list = results.value.map(g => ({ value: g.id, label: g.statementName }))
  // Keep the chosen giver in the list so its name still shows.
  if (model.value && !list.some(i => i.value === model.value) && known.value.has(model.value)) {
    list.unshift({ value: model.value, label: known.value.get(model.value)! })
  }
  return [{ value: LOOSE, label: 'Loose / anonymous (not on a statement)', icon: 'i-lucide-banknote' }, ...list]
})

let timer: ReturnType<typeof setTimeout> | undefined
const search = async () => {
  searching.value = true
  try {
    const { givers } = await $fetch('/api/admin/giving/givers/search', { query: { q: searchTerm.value } })
    results.value = givers
    for (const g of givers) known.value.set(g.id, g.statementName)
  }
  catch (err) {
    toast.add({ title: 'Givers could not be searched', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    searching.value = false
  }
}
watch(searchTerm, () => {
  clearTimeout(timer)
  timer = setTimeout(search, 200)
})

const quickAdd = async (name: string) => {
  try {
    const { giver } = await $fetch('/api/admin/giving/givers/quick', { method: 'POST', body: { statementName: name } })
    known.value.set(giver.id, giver.statementName)
    results.value = [giver, ...results.value]
    model.value = giver.id
    toast.add({ title: `Added ${giver.statementName}`, description: 'The Treasurer completes their address later.', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (err) {
    toast.add({ title: 'Giver not added', description: apiErrorMessage(err), color: 'error' })
  }
}

const menu = useTemplateRef<{ $el: HTMLElement }>('menu')
defineExpose({
  focus: () => (menu.value?.$el?.querySelector?.('button') ?? menu.value?.$el as HTMLElement | undefined)?.focus?.(),
  remember: (giver: GiverSearchResult) => known.value.set(giver.id, giver.statementName),
})
</script>
