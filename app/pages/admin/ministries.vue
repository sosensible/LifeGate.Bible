<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Church Office</p>
          <h1 class="text-4xl font-bold font-serif text-white">Ministries</h1>
        </div>
        <UButton color="secondary" icon="i-lucide-plus" @click="openEditor(null)">Add ministry</UButton>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-6">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Ministries could not be loaded.')" />

        <div class="flex flex-wrap items-end justify-between gap-3">
          <p class="text-toned text-sm max-w-2xl">
            Names and descriptions show on the public Ministries page. Who serves in each is set on the People page.
            Renaming a ministry keeps its web address, so shared links still work.
          </p>
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search ministries..." class="w-full sm:w-64" />
        </div>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <UTable :data="filtered" :columns="columns" :loading="status === 'pending'" :empty="list.length ? 'Nothing matches that search.' : 'No ministries yet. Add the first one.'">
            <template #name-cell="{ row }">
              <UButton variant="link" color="neutral" class="px-0 font-semibold text-highlighted" @click="openEditor(row.original)">{{ row.original.name }}</UButton>
              <p class="text-muted text-xs line-clamp-2 max-w-xl whitespace-normal">{{ row.original.description }}</p>
            </template>
            <template #serving-cell="{ row }">
              <span class="text-toned whitespace-nowrap">
                {{ row.original.servingCount }} serving<template v-if="row.original.leaderCount"> · {{ row.original.leaderCount }} {{ row.original.leaderCount === 1 ? 'leader' : 'leaders' }}</template>
              </span>
            </template>
            <template #budget-cell="{ row }">
              <UBadge v-if="row.original.budgetGrantCount" color="neutral" variant="subtle" icon="i-lucide-wallet">
                {{ row.original.budgetGrantCount }} {{ row.original.budgetGrantCount === 1 ? 'category' : 'categories' }}
              </UBadge>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-external-link" :to="`/ministries/${row.original.slug}`" :aria-label="`View ${row.original.name}`" />
                <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${row.original.name}`" @click="openEditor(row.original)" />
              </div>
            </template>
          </UTable>
        </UCard>
      </div>
    </div>

    <UModal v-model:open="editorOpen" :title="editing ? `Edit ${editing.name}` : 'Add a ministry'">
      <template #body>
        <UForm id="ministry-form" :schema="ministrySchema" :state="state" class="space-y-4" @submit="save">
          <UFormField label="Name" name="name" required>
            <UInput v-model="state.name" placeholder="e.g. Youth Group" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Description" name="description" required help="Shown to everyone on the Ministries page.">
            <UTextarea v-model="state.description" :rows="3" class="w-full" />
          </UFormField>
          <p v-if="editing" class="text-muted text-xs">Web address: /ministries/{{ editing.slug }}</p>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-between">
          <UButton v-if="editing" color="error" variant="ghost" icon="i-lucide-trash-2" :disabled="!removable" @click="confirmOpen = true">Remove</UButton>
          <div class="flex gap-2 ml-auto">
            <UButton color="neutral" variant="outline" @click="editorOpen = false">Cancel</UButton>
            <UButton type="submit" form="ministry-form" :loading="busy">{{ editing ? 'Save' : 'Add ministry' }}</UButton>
          </div>
        </div>
        <p v-if="editing && !removable" class="text-muted text-xs w-full">{{ removeHint }}</p>
      </template>
    </UModal>

    <UModal v-model:open="confirmOpen" :title="`Remove ${editing?.name}?`" description="It leaves the Ministries page and every list of ministries. This can’t be undone.">
      <template #footer>
        <UButton color="neutral" variant="outline" @click="confirmOpen = false">Keep</UButton>
        <UButton color="error" :loading="busy" @click="remove">Remove</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { ministrySchema, type MinistryAdminView } from '#shared/ministries'

definePageMeta({
  middleware: 'auth',
  permission: { ministry: ['update'] },
  layout: 'default',
})
useSeoMeta({ title: 'Ministries | Lifegate Baptist Church' })

const toast = useToast()
const { data, error, status } = await useFetch('/api/admin/ministries')
const list = ref<MinistryAdminView[]>(data.value?.ministries ?? [])
watch(data, value => list.value = value?.ministries ?? [])

const search = ref('')
const filtered = computed(() => {
  const text = search.value.trim().toLowerCase()
  return list.value.filter(m => !text || `${m.name} ${m.description}`.toLowerCase().includes(text))
})

const columns: TableColumn<MinistryAdminView>[] = [
  { id: 'name', header: 'Ministry' },
  { id: 'serving', header: 'Serving' },
  { id: 'budget', header: 'Budget access' },
  { id: 'actions', header: '' },
]

const editorOpen = ref(false)
const confirmOpen = ref(false)
const editing = ref<MinistryAdminView | null>(null)
const state = reactive({ name: '', description: '' })
const openEditor = (ministry: MinistryAdminView | null) => {
  editing.value = ministry
  Object.assign(state, { name: ministry?.name ?? '', description: ministry?.description ?? '' })
  editorOpen.value = true
}

// Mirrors the server's rules, so the button explains itself.
const removable = computed(() => Boolean(editing.value && !editing.value.protected && !editing.value.servingCount && !editing.value.budgetGrantCount))
const removeHint = computed(() => {
  const m = editing.value
  if (!m) return ''
  if (m.protected) return 'The Missions ministry decides who can edit the Missions pages, so it can’t be removed.'
  if (m.servingCount) return 'To remove it, first take everyone off this ministry on the People page.'
  return 'To remove it, first remove its budget access in Stewardship → Ministry access.'
})

const busy = ref(false)
const run = async (work: () => Promise<{ ministries: MinistryAdminView[] }>, failure: string) => {
  busy.value = true
  try {
    list.value = (await work()).ministries
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

const save = async () => {
  const body = { name: state.name, description: state.description }
  const ok = await run(() => editing.value
    ? $fetch(`/api/admin/ministries/${editing.value.id}`, { method: 'PATCH', body })
    : $fetch('/api/admin/ministries', { method: 'POST', body }), 'Ministry not saved')
  if (ok) editorOpen.value = false
}

const remove = async () => {
  if (!editing.value) return
  const ok = await run(() => $fetch(`/api/admin/ministries/${editing.value!.id}`, { method: 'DELETE' }), 'Ministry not removed')
  if (ok) {
    confirmOpen.value = false
    editorOpen.value = false
  }
}
</script>
