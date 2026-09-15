<template>
  <section>
    <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h2 class="font-serif text-2xl font-bold text-highlighted mb-1">Live meetings</h2>
        <p class="text-toned text-sm">A Join Live Meeting button shows on the Teaching page, and by the service times on the home page, only at these times.</p>
      </div>
      <UButton icon="i-lucide-calendar-plus" @click="openEditor(null)">Schedule live meeting</UButton>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Live meetings could not be loaded.')" />

    <div v-else class="bg-elevated rounded-lg border border-default overflow-x-auto">
      <UTable :data="meetings" :columns="columns" :loading="status === 'pending'" empty="No live meetings scheduled.">
        <template #title-cell="{ row }">
          <UButton variant="link" color="neutral" class="px-0 font-bold text-highlighted" @click="openEditor(row.original)">{{ row.original.title }}</UButton>
          <p class="text-muted text-xs">{{ LIVE_KIND_LABELS[row.original.kind] }}</p>
        </template>
        <template #schedule-cell="{ row }">
          <span class="text-toned">{{ describeLiveSchedule(row.original) }}</span>
        </template>
        <template #next-cell="{ row }">
          <UBadge v-if="row.original.next?.showing" color="error" variant="subtle" icon="i-lucide-radio">Showing now</UBadge>
          <span v-else-if="row.original.next" class="text-toned whitespace-nowrap">{{ formatLiveDate(row.original.next.date) }}</span>
          <UBadge v-else color="neutral" variant="subtle">Ended</UBadge>
        </template>
        <template #access-cell="{ row }">
          <UBadge variant="subtle" :color="row.original.visibility === 'public' ? 'primary' : 'neutral'" :icon="row.original.visibility === 'public' ? 'i-lucide-globe' : 'i-lucide-lock'">
            {{ row.original.visibility === 'public' ? 'Everyone' : 'Members' }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${row.original.title}`" @click="openEditor(row.original)" />
          </div>
        </template>
      </UTable>
    </div>

    <AdminLiveMeetingSlideover v-model:open="editorOpen" :meeting="editing" :time-zone="timeZone" @saved="refresh()" @removed="refresh()" />
  </section>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { LIVE_KIND_LABELS, type AdminLiveMeetingView } from '#shared/live'

const { data, error, status, refresh } = await useFetch('/api/admin/live-meetings')
const meetings = computed(() => data.value?.meetings ?? [])
const timeZone = computed(() => data.value?.timeZone ?? 'America/Detroit')

const columns: TableColumn<AdminLiveMeetingView>[] = [
  { id: 'title', header: 'Meeting' },
  { id: 'schedule', header: 'When' },
  { id: 'next', header: 'Next' },
  { id: 'access', header: 'Who can join' },
  { id: 'actions', header: '' },
]

const editorOpen = ref(false)
const editing = ref<AdminLiveMeetingView | null>(null)
const openEditor = (meeting: AdminLiveMeetingView | null) => {
  editing.value = meeting
  editorOpen.value = true
}
</script>
