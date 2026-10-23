<template>
  <UCard :ui="{ body: 'p-0 sm:p-0', header: 'p-4 sm:p-5', footer: 'p-4 sm:p-5' }">
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="font-serif font-bold text-lg text-highlighted leading-tight">{{ list.name }}</h3>
          <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
            <UBadge v-if="list.run" color="primary" variant="subtle" size="sm" icon="i-lucide-play">Run</UBadge>
            <UBadge v-else color="neutral" variant="subtle" size="sm">{{ KIND_LABELS[list.kind] }}</UBadge>
            <UBadge v-if="list.run && list.kind === 'tasks'" color="neutral" variant="subtle" size="sm">Tasks</UBadge>
            <UBadge v-if="list.audience !== 'ministry'" color="secondary" variant="subtle" size="sm" icon="i-lucide-lock">{{ AUDIENCE_LABELS[list.audience] }}</UBadge>
            <UBadge v-if="list.run?.endedAt" :color="list.run.endedHow === 'complete' ? 'success' : 'warning'" variant="subtle" size="sm">
              {{ list.run.endedHow === 'complete' ? 'Finished' : 'Ended early' }}
            </UBadge>
            <span v-if="list.kind !== 'routine' && list.items.length" class="text-xs text-muted">{{ doneCount }} of {{ list.items.length }} done</span>
          </div>
          <p v-if="list.run" class="text-xs text-muted mt-1.5">
            Started {{ formatDateTime(list.run.startedAt) }}<template v-if="list.run.startedBy"> by {{ list.run.startedBy.name }}</template>
          </p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <UDropdownMenu v-if="list.canStartRun" :items="startMenu" :content="{ align: 'end' }">
            <UButton size="sm" icon="i-lucide-play" trailing-icon="i-lucide-chevron-down" :loading="busy === 'start'" :disabled="!list.items.length">Start a run</UButton>
          </UDropdownMenu>
          <UButton v-if="list.canEndRun" size="sm" color="neutral" variant="outline" icon="i-lucide-flag" :loading="busy === 'finish'" @click="finishRun">Finish run</UButton>
          <UButton v-if="pastRuns.length" color="neutral" variant="ghost" size="xs" icon="i-lucide-archive" :aria-label="`Past runs of ${list.name}`" @click="pastOpen = true" />
          <UButton v-if="list.canSeeHistory" color="neutral" variant="ghost" size="xs" icon="i-lucide-history" aria-label="History" @click="historyOpen = true" />
          <UDropdownMenu v-if="canManage" :items="listMenu" :content="{ align: 'end' }">
            <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-ellipsis" :aria-label="`Options for ${list.name}`" />
          </UDropdownMenu>
        </div>
      </div>
      <p v-if="list.kind === 'routine'" class="text-xs text-muted mt-3">
        A template. Starting a run makes a fresh checklist or set of tasks from these steps; editing them later never changes a run already started.
        <template v-if="openRun"> A run is open now.</template>
      </p>
    </template>

    <p v-if="!list.items.length" class="px-4 sm:px-5 pb-4 text-sm text-muted">
      {{ emptyText }}
    </p>

    <ul v-else class="divide-y divide-default">
      <li v-for="(item, index) in list.items" :key="item.id" class="px-4 sm:px-5 py-3 flex items-start gap-3">
        <span v-if="list.ordered" class="text-muted text-sm w-5 pt-px text-right shrink-0 tabular-nums">{{ index + 1 }}.</span>
        <UIcon v-if="list.kind === 'routine'" name="i-lucide-circle-dashed" class="size-4 mt-1 text-muted shrink-0" />
        <UCheckbox
          v-else
          class="pt-0.5"
          :model-value="Boolean(item.done)"
          :disabled="!item.canCheck || busy === item.id"
          :aria-label="`${item.done ? 'Take back' : 'Check off'} ${item.title}`"
          @update:model-value="value => check(item, Boolean(value))"
        />
        <div class="min-w-0 flex-1">
          <p class="leading-snug" :class="item.done ? 'text-muted line-through' : 'text-highlighted'">{{ item.title }}</p>

          <p v-if="list.kind === 'tasks'" class="text-xs text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span v-if="item.assignee" class="inline-flex items-center gap-1"><UIcon name="i-lucide-user-round" class="size-3.5" />{{ item.mine ? 'You' : item.assignee.name }}</span>
            <span v-else-if="!item.done">No one yet</span>
            <span v-if="item.dueDate" class="inline-flex items-center gap-1" :class="{ 'text-error font-medium': item.overdue }">
              <UIcon name="i-lucide-calendar" class="size-3.5" />{{ formatDue(item.dueDate, item.dueTime) }}<template v-if="item.overdue"> · overdue</template>
            </span>
            <span v-if="item.done?.by">Done by {{ item.done.by.name }}</span>
          </p>
          <p v-else-if="item.done?.by" class="text-xs text-muted mt-1">Done by {{ item.done.by.name }}</p>

          <UAlert
            v-if="item.unassigned"
            class="mt-2"
            color="warning"
            variant="subtle"
            icon="i-lucide-user-x"
            :description="`${item.unassigned.note}. This task needs someone new.`"
            :actions="[{ label: 'Dismiss', color: 'neutral', variant: 'outline', size: 'xs', onClick: () => dismiss(item) }]"
          />
        </div>

        <UDropdownMenu v-if="canManage && !list.run?.endedAt" :items="itemMenu(item, index)" :content="{ align: 'end' }">
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-ellipsis" :aria-label="`Options for ${item.title}`" />
        </UDropdownMenu>
      </li>
    </ul>

    <template v-if="showAdd" #footer>
      <form v-if="list.kind !== 'tasks'" class="flex gap-2" @submit.prevent="addPlain">
        <UInput v-model="newTitle" class="flex-1" :placeholder="list.kind === 'routine' ? 'Add a step' : 'Add an item'" maxlength="120" :aria-label="`Add to ${list.name}`" />
        <UButton type="submit" icon="i-lucide-plus" :loading="busy === 'add'" :disabled="!newTitle.trim()">Add</UButton>
      </form>
      <UButton v-else variant="outline" icon="i-lucide-plus" @click="openItem(null)">Add a task</UButton>
    </template>

    <LazyMinistryItemSlideover v-model:open="itemOpen" :list="list" :item="editingItem" :people="people" @saved="emit('changed')" />
    <LazyMinistryListSlideover v-model:open="listOpen" :list="list" :ministry-slug="list.ministry.slug" @saved="emit('changed')" />
    <LazyMinistryHistoryModal v-if="list.canSeeHistory" v-model:open="historyOpen" :list-id="list.id" :list-name="list.name" />
    <LazyMinistryPastRunsModal v-if="pastRuns.length" v-model:open="pastOpen" :routine-name="list.name" :runs="pastRuns" @changed="emit('changed')" />

    <UModal v-model:open="confirmingDelete" :title="`Delete “${list.name}”?`" :description="deleteDescription">
      <template #footer>
        <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep it</UButton>
        <UButton color="error" :loading="busy === 'delete'" @click="removeList">Delete</UButton>
      </template>
    </UModal>

    <UModal v-model:open="confirmingReplace" title="A run is already open" :description="`“${openRun?.name ?? ''}” is still open. Starting another finishes it as unfinished and keeps it in the past runs.`">
      <template #footer>
        <UButton color="neutral" variant="outline" @click="confirmingReplace = false">Cancel</UButton>
        <UButton :loading="busy === 'start'" @click="startRun(pendingStyle, true)">Finish it and start a new run</UButton>
      </template>
    </UModal>
  </UCard>
</template>

<script setup lang="ts">
import { AUDIENCE_LABELS, KIND_LABELS, type ListItemView, type MinistryListView, type RosterOption, type RunStyle } from '#shared/ministry-lists'

const props = withDefaults(defineProps<{
  list: MinistryListView
  // Who a task can be given to. Only a leader is sent this.
  people?: RosterOption[]
  // Off on the personal page: managing happens on the ministry's own page.
  manage?: boolean
  // For a routine: the run that is open now, and the finished ones.
  openRun?: MinistryListView | null
  pastRuns?: MinistryListView[]
}>(), { people: () => [], manage: true, openRun: null, pastRuns: () => [] })
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const canManage = computed(() => props.manage && props.list.canManage)
const showAdd = computed(() => props.list.kind === 'tasks' ? canManage.value && !props.list.run?.endedAt : props.list.canAdd)
const doneCount = computed(() => props.list.items.filter(item => item.done).length)
const emptyText = computed(() => props.list.kind === 'routine'
  ? 'No steps yet. Add the steps this routine is made of.'
  : props.list.kind === 'tasks' ? 'No tasks yet.' : 'Nothing on this list yet.')

const busy = ref<string | null>(null)
const act = async (key: string, run: () => Promise<unknown>, failure: string) => {
  busy.value = key
  try {
    await run()
    emit('changed')
  }
  catch (error) {
    toast.add({ title: failure, description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    busy.value = null
  }
}

const check = (item: ListItemView, done: boolean) =>
  act(item.id, () => $fetch(`/api/ministry-lists/${props.list.id}/items/${item.id}/check`, { method: 'POST', body: { done } }), 'Could not update that')

const newTitle = ref('')
const addPlain = async () => {
  const title = newTitle.value.trim()
  if (!title) return
  await act('add', () => $fetch(`/api/ministry-lists/${props.list.id}/items`, { method: 'POST', body: { title } }), 'Could not add that')
  newTitle.value = ''
}

const dismiss = (item: ListItemView) =>
  act(item.id, () => $fetch(`/api/ministry-lists/${props.list.id}/items/${item.id}/dismiss-notice`, { method: 'POST' }), 'Could not dismiss that')

const move = (index: number, by: -1 | 1) => {
  const ids = props.list.items.map(item => item.id)
  const target = index + by
  if (target < 0 || target >= ids.length) return
  ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
  return act('order', () => $fetch(`/api/ministry-lists/${props.list.id}/items/order`, { method: 'PUT', body: { ids } }), 'Could not reorder that')
}

const removeItem = (item: ListItemView) =>
  act(item.id, () => $fetch(`/api/ministry-lists/${props.list.id}/items/${item.id}`, { method: 'DELETE' }), 'Could not remove that')

const itemOpen = ref(false)
const editingItem = ref<ListItemView | null>(null)
const openItem = (item: ListItemView | null) => {
  editingItem.value = item
  itemOpen.value = true
}

const itemMenu = (item: ListItemView, index: number) => [
  [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openItem(item) },
    { label: 'Move up', icon: 'i-lucide-arrow-up', disabled: index === 0, onSelect: () => move(index, -1) },
    { label: 'Move down', icon: 'i-lucide-arrow-down', disabled: index === props.list.items.length - 1, onSelect: () => move(index, 1) },
  ],
  [{ label: 'Remove', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeItem(item) }],
]

// Routines: starting and finishing runs.
const confirmingReplace = ref(false)
const pendingStyle = ref<RunStyle>('list')
const startMenu = computed(() => [[
  { label: 'Start as a checklist', description: 'Anyone serving ticks the steps off.', icon: 'i-lucide-list-checks', onSelect: () => startRun('list') },
  { label: 'Start as tasks', description: 'Steps you can give to people, with due dates.', icon: 'i-lucide-user-round-check', onSelect: () => startRun('tasks') },
]])
const startRun = async (style: RunStyle, replaceOpen = false) => {
  // Starting another run finishes the open one as unfinished, so ask first.
  if (props.openRun && !replaceOpen) {
    pendingStyle.value = style
    confirmingReplace.value = true
    return
  }
  await act('start', () => $fetch(`/api/ministry-lists/${props.list.id}/runs`, { method: 'POST', body: { style, replaceOpen } }), 'Could not start a run')
  confirmingReplace.value = false
  toast.add({ title: 'Run started', color: 'success', icon: 'i-lucide-circle-check' })
}
const finishRun = () =>
  act('finish', () => $fetch(`/api/ministry-lists/${props.list.id}/finish`, { method: 'POST' }), 'Could not finish the run')

const listOpen = ref(false)
const historyOpen = ref(false)
const pastOpen = ref(false)
const confirmingDelete = ref(false)
const listMenu = [
  [{ label: 'Edit list', icon: 'i-lucide-pencil', onSelect: () => { listOpen.value = true } }],
  [{ label: 'Delete list', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { confirmingDelete.value = true } }],
]
const deleteDescription = computed(() => props.list.kind === 'routine'
  ? 'The routine, every run of it, their items and their history are removed for good.'
  : 'The list, its items and its history are removed for good.')
const removeList = async () => {
  await act('delete', () => $fetch(`/api/ministry-lists/${props.list.id}`, { method: 'DELETE' }), 'Could not delete that list')
  confirmingDelete.value = false
}
</script>
