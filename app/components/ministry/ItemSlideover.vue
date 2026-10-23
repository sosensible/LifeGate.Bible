<template>
  <USlideover v-model:open="open" :title="item ? (list.kind === 'routine' ? 'Edit step' : 'Edit item') : list.kind === 'tasks' ? 'New task' : list.kind === 'routine' ? 'New step' : 'New item'" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <UForm id="ministry-item-form" :schema="schema" :state="state" class="space-y-6" @submit="save">
        <UFormField :label="list.kind === 'tasks' ? 'What needs doing' : list.kind === 'routine' ? 'Step' : 'Item'" name="title" required>
          <UInput v-model="state.title" class="w-full" maxlength="120" />
        </UFormField>

        <template v-if="list.kind === 'tasks'">
          <UFormField
            label="Give it to"
            name="assigneeId"
            :description="list.audience === 'leaders' ? 'Only a leader, since this list is leaders-only.' : 'Anyone serving in this ministry who is shown on its roster.'"
          >
            <p v-if="hiddenAssignee" class="text-sm text-muted">
              Given to someone who keeps their name private. Choose another person below to give it to them instead.
            </p>
            <USelectMenu
              v-model="state.assigneeId"
              :items="assignable"
              value-key="id"
              label-key="name"
              placeholder="No one yet"
              clear
              class="w-full"
              @update:model-value="touched = true"
            />
          </UFormField>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Due" name="dueDate" hint="Optional">
              <UInput v-model="dueDate" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Time" name="dueTime" hint="Optional, needs a date">
              <UInput v-model="dueTime" type="time" class="w-full" :disabled="!state.dueDate" />
            </UFormField>
          </div>
        </template>
      </UForm>
    </template>

    <template #footer>
      <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
      <UButton type="submit" form="ministry-item-form" :loading="saving">{{ item ? 'Save' : 'Add' }}</UButton>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { itemInputSchema, type ListItemView, type MinistryListView, type RosterOption } from '#shared/ministry-lists'

const props = defineProps<{ list: MinistryListView, item: ListItemView | null, people: RosterOption[] }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const schema = itemInputSchema

const state = reactive({ title: '', assigneeId: null as string | null, dueDate: null as string | null, dueTime: null as string | null })
// Empty date and time inputs mean none.
const dueDate = computed({ get: () => state.dueDate ?? '', set: (value: string) => { state.dueDate = value || null; if (!value) state.dueTime = null } })
const dueTime = computed({ get: () => state.dueTime ?? '', set: (value: string) => { state.dueTime = value || null } })

// On a leaders-only list the choice is leaders; elsewhere, the whole roster.
const assignable = computed(() => props.people.filter(person => props.list.audience !== 'leaders' || person.isLeader))

// A task may be held by someone who keeps their name private. Their id is not
// sent to us, so saving must not read "no one chosen" as "take it away".
const hiddenAssignee = computed(() => Boolean(props.item?.assignee && props.item.assignee.id === null))
const touched = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  touched.value = false
  Object.assign(state, props.item
    ? { title: props.item.title, assigneeId: props.item.assignee?.id ?? null, dueDate: props.item.dueDate, dueTime: props.item.dueTime }
    : { title: '', assigneeId: null, dueDate: null, dueTime: null })
}, { immediate: true })

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const body: Record<string, unknown> = { title: state.title }
    if (props.list.kind === 'tasks') {
      body.dueDate = state.dueDate
      body.dueTime = state.dueTime
      if (!hiddenAssignee.value || touched.value) body.assigneeId = state.assigneeId ?? null
    }
    if (props.item) await $fetch(`/api/ministry-lists/${props.list.id}/items/${props.item.id}`, { method: 'PATCH', body })
    else await $fetch(`/api/ministry-lists/${props.list.id}/items`, { method: 'POST', body })
    emit('saved')
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = false
  }
}
</script>
