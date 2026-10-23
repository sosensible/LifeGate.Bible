<template>
  <USlideover v-model:open="open" :title="list ? 'Edit list' : 'New list'" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <UForm id="ministry-list-form" :schema="schema" :state="state" class="space-y-6" @submit="save">
        <UFormField label="Name" name="name" required>
          <UInput v-model="state.name" class="w-full" placeholder="e.g. Sunday setup" maxlength="60" />
        </UFormField>

        <UFormField v-if="!list" label="What kind of list" name="kind">
          <URadioGroup v-model="state.kind" :items="kindItems" />
        </UFormField>
        <p v-else class="text-sm text-muted">
          {{ list.routineId ? 'A run of a routine. It is seen by the same people as the routine.' : `${KIND_LABELS[list.kind]}. The kind is fixed once it is made, so tasks never lose their assignees by accident.` }}
        </p>

        <UFormField v-if="!list?.routineId" label="Who can see it" name="audience">
          <URadioGroup v-model="state.audience" :items="audienceItems" />
        </UFormField>

        <USwitch
          v-if="!list?.routineId && state.audience === 'assigned'"
          v-model="state.assigneesSeeAll"
          label="Assigned people can see each other’s tasks"
          description="Off: each person sees only the tasks given to them. Either way only the person a task is given to can tick it off, and the leaders."
        />

        <USwitch v-model="state.ordered" label="Numbered steps" description="Items are shown in order, 1, 2, 3." />
      </UForm>
    </template>

    <template #footer>
      <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
      <UButton type="submit" form="ministry-list-form" :loading="saving">{{ list ? 'Save' : 'Create list' }}</UButton>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { KIND_LABELS, listInputSchema, type MinistryListView } from '#shared/ministry-lists'

const props = defineProps<{ list: MinistryListView | null, ministrySlug: string }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const schema = listInputSchema

const kindItems = [
  { value: 'list', label: 'Checklist', description: 'Plain items anyone serving here can add and tick off.' },
  { value: 'tasks', label: 'Tasks', description: 'Items you give to someone, with a due date. Only leaders add them.' },
  { value: 'routine', label: 'Routine', description: 'A reusable set of steps, like “Sunday setup”. Anyone serving starts a run when it is time, as a fresh checklist or as tasks to give out.' },
]
// "Leaders and assignees" only makes sense where tasks can be given out.
const kindNow = computed(() => props.list ? props.list.kind : state.kind)
const audienceItems = computed(() => [
  { value: 'ministry', label: 'Everyone serving in this ministry', description: 'Plus pastors and the church secretary, who can read but not change it.' },
  { value: 'leaders', label: 'Leaders only', description: 'Only this ministry’s leaders and the pastors. Nobody else can see it exists.' },
  ...(kindNow.value === 'tasks'
    ? [{ value: 'assigned', label: 'Leaders and the people given a task', description: 'The leaders and pastors, plus each person holding a task on it. Nobody else can see it exists.' }]
    : []),
])

const state = reactive({ name: '', kind: 'list' as 'list' | 'tasks' | 'routine', audience: 'ministry' as 'ministry' | 'leaders' | 'assigned', ordered: false, assigneesSeeAll: false })

// Choosing a kind that has no tasks takes that audience away.
watch(() => state.kind, (kind) => {
  if (kind !== 'tasks' && state.audience === 'assigned') state.audience = 'ministry'
})

watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(state, props.list
    ? { name: props.list.name, kind: props.list.kind, audience: props.list.audience, ordered: props.list.ordered, assigneesSeeAll: props.list.assigneesSeeAll }
    : { name: '', kind: 'list', audience: 'ministry', ordered: false, assigneesSeeAll: false })
}, { immediate: true })

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    if (props.list) {
      // A run follows its routine's audience, so it is never sent one.
      const body = props.list.routineId
        ? { name: state.name, ordered: state.ordered }
        : { name: state.name, audience: state.audience, ordered: state.ordered, assigneesSeeAll: state.audience === 'assigned' && state.assigneesSeeAll }
      await $fetch(`/api/ministry-lists/${props.list.id}`, { method: 'PATCH', body })
    }
    else {
      await $fetch(`/api/ministries/${encodeURIComponent(props.ministrySlug)}/lists`, { method: 'POST', body: { ...state } })
    }
    toast.add({ title: props.list ? 'Changes saved' : 'List created', color: 'success', icon: 'i-lucide-circle-check' })
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
