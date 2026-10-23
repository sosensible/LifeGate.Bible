<template>
  <UModal v-model:open="open" :title="`Past runs: ${routineName}`" description="Finished runs, newest first. These are records, so they can’t be changed.">
    <template #body>
      <ul class="space-y-5">
        <li v-for="run in runs" :key="run.id">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold text-highlighted leading-tight">{{ run.name }}</p>
              <p class="text-xs text-muted mt-0.5">
                Started {{ formatDateTime(run.run!.startedAt) }}<template v-if="run.run!.startedBy"> by {{ run.run!.startedBy.name }}</template>
                · finished {{ formatDateTime(run.run!.endedAt!) }}
              </p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <UBadge :color="run.run!.endedHow === 'complete' ? 'success' : 'warning'" variant="subtle" size="sm">
                {{ run.run!.endedHow === 'complete' ? 'Finished' : `${doneOf(run)} of ${run.items.length}` }}
              </UBadge>
              <UButton v-if="run.canManage" color="neutral" variant="ghost" size="xs" icon="i-lucide-trash-2" :aria-label="`Delete ${run.name}`" :loading="deleting === run.id" @click="remove(run)" />
            </div>
          </div>
          <ul class="mt-2 space-y-1">
            <li v-for="item in run.items" :key="item.id" class="text-sm flex items-start gap-2">
              <UIcon :name="item.done ? 'i-lucide-check' : 'i-lucide-minus'" class="size-4 mt-0.5 shrink-0" :class="item.done ? 'text-success' : 'text-muted'" />
              <span :class="item.done ? 'text-highlighted' : 'text-muted'">
                {{ item.title }}
                <span v-if="item.done?.by" class="text-xs text-muted"> · {{ item.done.by.name }}</span>
              </span>
            </li>
          </ul>
        </li>
      </ul>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { MinistryListView } from '#shared/ministry-lists'

defineProps<{ routineName: string, runs: MinistryListView[] }>()
const emit = defineEmits<{ changed: [] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const doneOf = (run: MinistryListView) => run.items.filter(item => item.done).length

const deleting = ref<string | null>(null)
const remove = async (run: MinistryListView) => {
  deleting.value = run.id
  try {
    await $fetch(`/api/ministry-lists/${run.id}`, { method: 'DELETE' })
    emit('changed')
  }
  catch (error) {
    toast.add({ title: 'Could not delete that run', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    deleting.value = null
  }
}
</script>
