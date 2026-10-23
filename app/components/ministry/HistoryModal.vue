<template>
  <UModal v-model:open="open" :title="`History: ${listName}`" description="Who checked what off, and when. Newest first.">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
      <p v-else-if="loading" class="text-muted text-sm">Loading…</p>
      <UEmpty v-else-if="!entries.length" icon="i-lucide-history" title="Nothing checked off yet" />
      <ul v-else class="divide-y divide-default -my-2">
        <li v-for="entry in entries" :key="entry.id" class="py-2.5 text-sm">
          <p :class="entry.undoneAt ? 'text-muted line-through' : 'text-highlighted'">{{ entry.itemTitle }}</p>
          <p class="text-muted text-xs">
            {{ entry.by }} · {{ formatDateTime(entry.at) }}
            <template v-if="entry.undoneAt"> · taken back {{ formatDateTime(entry.undoneAt) }}</template>
          </p>
        </li>
      </ul>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { HistoryEntry } from '#shared/ministry-lists'

const props = defineProps<{ listId: string, listName: string }>()
const open = defineModel<boolean>('open', { required: true })

const entries = ref<HistoryEntry[]>([])
const loading = ref(false)
const error = ref('')

// Fetched each time it opens, so it is never a stale copy.
watch(open, async (isOpen) => {
  if (!isOpen) return
  loading.value = true
  error.value = ''
  try {
    entries.value = (await $fetch<{ entries: HistoryEntry[] }>(`/api/ministry-lists/${props.listId}/history`)).entries
  }
  catch (e) {
    error.value = apiErrorMessage(e, 'The history could not be loaded.')
  }
  finally {
    loading.value = false
  }
})
</script>
