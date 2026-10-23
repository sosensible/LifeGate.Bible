<template>
  <section v-if="show" class="bg-muted py-10 px-6">
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 class="text-2xl font-bold font-serif text-highlighted">Lists and tasks</h2>
          <p class="text-toned text-sm mt-1">
            For the people serving here.
            <NuxtLink to="/my-lists" class="text-primary hover:underline">See everything assigned to you</NuxtLink>
          </p>
        </div>
        <UButton v-if="data?.canManage" icon="i-lucide-plus" @click="listOpen = true">New list</UButton>
      </div>

      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'The lists could not be loaded. Lists need a connection.')" />

      <MinistryListGrid v-else-if="data?.lists.length" :lists="data.lists" :people="data.people" @changed="refresh()" />

      <UEmpty
        v-else-if="status !== 'pending'"
        icon="i-lucide-list-checks"
        title="No lists yet"
        description="Start a checklist, a list of tasks to give to the people serving here, or a routine: a reusable set of steps you start a fresh run of whenever the ministry does it."
      />

      <LazyMinistryListSlideover v-model:open="listOpen" :list="null" :ministry-slug="slug" @saved="refresh()" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { MinistryListsPayload } from '#shared/ministry-lists'

const props = defineProps<{ slug: string }>()

// Fetched in the browser only. Server-rendered, the answer would be written into
// the page's HTML, which the offline cache stores; what someone may see here
// changes when a leader does, so it is never kept.
const { data, error, status, refresh } = useFetch<MinistryListsPayload>(() => `/api/ministries/${encodeURIComponent(props.slug)}/lists`, {
  server: false,
  lazy: true,
})

// Nothing to show a member of a ministry that keeps no lists, and nothing to
// say to someone who cannot see any.
const show = computed(() => Boolean(error.value) || Boolean(data.value && (data.value.lists.length || data.value.canManage)))

const listOpen = ref(false)
</script>
