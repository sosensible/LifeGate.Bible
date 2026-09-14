<template>
  <!-- Staff and admins only: archived entries, closed until opened. -->
  <UAccordion :items="[{ label: `Archived (${total})`, icon: 'i-lucide-archive', slot: 'archive' }]" :unmount-on-hide="false" class="border border-default rounded-lg px-4 bg-elevated">
    <template #archive>
      <p class="text-muted text-xs mb-4">Only staff and administrators see this. Restore puts an entry back where members can see it; removing it cannot be undone.</p>
      <p v-if="total === 0" class="text-muted text-sm pb-4">Nothing is archived.</p>
      <div v-for="section in sections.filter(s => s.items.length)" :key="section.label" class="pb-4">
        <h3 v-if="sections.length > 1" class="text-gold-600 text-[10px] tracking-[0.15em] uppercase mb-2">{{ section.label }}</h3>
        <ul class="divide-y divide-default border border-default rounded-md">
          <li v-for="item in section.items" :key="item.id" class="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
            <div class="min-w-0 text-sm">
              <NuxtLink v-if="item.to" :to="item.to" class="text-highlighted font-medium hover:underline">{{ item.name }}</NuxtLink>
              <span v-else class="text-highlighted font-medium">{{ item.name }}</span>
              <p class="text-muted text-xs">
                <span v-if="item.detail">{{ item.detail }} · </span>Archived {{ formatRelative(item.archivedAt) }}
              </p>
            </div>
            <div class="flex gap-2">
              <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-archive-restore" :loading="busy === item.id" @click="restore(section, item)">Restore</UButton>
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="removing = { section, item }">Remove</UButton>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </UAccordion>

  <UModal
    :open="Boolean(removing)"
    :title="removing ? `Permanently remove ${removing.item.name}?` : ''"
    :description="removing ? removing.section.removeWarning(removing.item) : ''"
    @update:open="value => { if (!value) removing = null }"
  >
    <template #footer>
      <UButton color="neutral" variant="outline" @click="removing = null">Keep in archive</UButton>
      <UButton color="error" :loading="busy === removing?.item.id" @click="remove">Remove permanently</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
export interface ArchivedItem {
  id: string
  name: string
  detail?: string | null
  archivedAt: string
  to?: string
}

export interface ArchiveSection {
  label: string
  items: ArchivedItem[]
  // API paths for an item: POST {base}/restore, DELETE {base}.
  base: (item: ArchivedItem) => string
  removeWarning: (item: ArchivedItem) => string
}

const props = defineProps<{ sections: ArchiveSection[] }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const total = computed(() => props.sections.reduce((sum, section) => sum + section.items.length, 0))
const busy = ref<string | null>(null)
const removing = ref<{ section: ArchiveSection, item: ArchivedItem } | null>(null)

const restore = async (section: ArchiveSection, item: ArchivedItem) => {
  busy.value = item.id
  try {
    await $fetch(`${section.base(item)}/restore`, { method: 'POST' })
    toast.add({ title: `${item.name} restored`, color: 'success', icon: 'i-lucide-circle-check' })
    emit('changed')
  }
  catch (error) {
    toast.add({ title: 'Not restored', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    busy.value = null
  }
}

const remove = async () => {
  if (!removing.value) return
  const { section, item } = removing.value
  busy.value = item.id
  try {
    await $fetch(section.base(item), { method: 'DELETE' })
    toast.add({ title: `${item.name} removed`, color: 'success' })
    removing.value = null
    emit('changed')
  }
  catch (error) {
    toast.add({ title: 'Not removed', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    busy.value = null
  }
}
</script>
