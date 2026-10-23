<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
    <template v-for="list in topLevel" :key="list.id">
      <MinistryListCard :list="list" :people="people" :manage="manage" :open-run="openRunOf(list)" :past-runs="pastRunsOf(list)" @changed="emit('changed')" />
      <!-- The run that is open, right beside the routine it came from. -->
      <MinistryListCard v-if="openRunOf(list)" :list="openRunOf(list)!" :people="people" :manage="manage" @changed="emit('changed')" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { MinistryListView, RosterOption } from '#shared/ministry-lists'

const props = withDefaults(defineProps<{ lists: MinistryListView[], people?: RosterOption[], manage?: boolean }>(), { people: () => [], manage: true })
const emit = defineEmits<{ changed: [] }>()

// A run is generated from a routine and belongs beside it: the open one as its
// own card, the finished ones behind a button on the routine.
const ids = computed(() => new Set(props.lists.map(list => list.id)))
const runsOf = (routine: MinistryListView) => props.lists.filter(list => list.routineId === routine.id)
const openRunOf = (routine: MinistryListView) => runsOf(routine).find(run => !run.run?.endedAt) ?? null
const pastRunsOf = (routine: MinistryListView) =>
  runsOf(routine).filter(run => run.run?.endedAt).sort((a, b) => b.run!.endedAt!.localeCompare(a.run!.endedAt!))

// Anything that is not a run, plus a run whose routine somehow is not here.
const topLevel = computed(() => props.lists.filter(list => !list.routineId || !ids.value.has(list.routineId)))
</script>
