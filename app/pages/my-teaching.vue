<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Teaching</p>
        <h1 class="text-4xl font-bold font-serif text-white">My teaching</h1>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-6">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Your messages could not be loaded.')" />

        <p class="text-toned text-sm max-w-2xl">
          Messages that name you as the speaker. You can edit their title, date, series, passage, books, topics and notes.
          The video, who can watch and publishing are kept by the church office.
        </p>

        <UEmpty
          v-if="!sermons.length && status !== 'pending'"
          icon="i-lucide-book-open"
          title="No messages name you yet"
          description="When the church office adds a message and picks you from the Speakers list, it shows up here."
        />

        <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
          <UTable :data="sermons" :columns="columns" :loading="status === 'pending'">
            <template #date-cell="{ row }">
              <span class="text-toned whitespace-nowrap">{{ formatSermonDate(row.original.preachedOn) }}</span>
            </template>
            <template #title-cell="{ row }">
              <UButton variant="link" color="neutral" class="px-0 font-semibold text-highlighted" @click="edit(row.original)">{{ row.original.title }}</UButton>
              <p class="text-muted text-xs">{{ [row.original.series?.name, row.original.scripture].filter(Boolean).join(' · ') }}</p>
            </template>
            <template #status-cell="{ row }">
              <div class="flex flex-wrap gap-1">
                <UBadge variant="subtle" :color="row.original.status === 'published' ? 'success' : 'warning'">{{ row.original.status === 'published' ? 'Published' : 'Draft' }}</UBadge>
                <UBadge variant="subtle" color="neutral" :icon="row.original.visibility === 'public' ? 'i-lucide-globe' : 'i-lucide-lock'">{{ row.original.visibility === 'public' ? 'Everyone' : 'Members' }}</UBadge>
              </div>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-external-link" :to="`/teaching/${row.original.slug}`" :aria-label="`View ${row.original.title}`" />
                <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Edit ${row.original.title}`" @click="edit(row.original)" />
              </div>
            </template>
          </UTable>
        </UCard>
      </div>
    </div>

    <TeachingEditor v-model:open="editorOpen" :sermon="editing" :series="series" @saved="onSaved" />
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminSermonView } from '#shared/sermons'

// Any signed-in account: a guest speaker with an account need not be a member.
definePageMeta({
  middleware: 'auth',
  permission: {},
  layout: 'default',
})
useSeoMeta({ title: 'My teaching | Lifegate Baptist Church' })

const { data, error, status } = await useFetch('/api/teaching/mine')
const sermons = ref<AdminSermonView[]>(data.value?.sermons ?? [])
watch(data, value => sermons.value = value?.sermons ?? [])
const series = computed(() => data.value?.series ?? [])

const columns: TableColumn<AdminSermonView>[] = [
  { id: 'date', header: 'Date' },
  { id: 'title', header: 'Message' },
  { id: 'status', header: 'Status' },
  { id: 'actions', header: '' },
]

const editorOpen = ref(false)
const editing = ref<AdminSermonView | null>(null)
const edit = (sermon: AdminSermonView) => {
  editing.value = sermon
  editorOpen.value = true
}
const onSaved = (saved: AdminSermonView) => {
  sermons.value = sermons.value.map(s => s.id === saved.id ? saved : s)
}
</script>
