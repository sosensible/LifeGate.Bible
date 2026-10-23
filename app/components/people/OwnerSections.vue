<template>
  <section class="space-y-10">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-bold font-serif text-highlighted">Just for you</h2>
        <p class="text-sm text-muted mt-1">Only you see this part of your page.</p>
      </div>
      <UButton to="/profile" icon="i-lucide-user-round-cog" color="neutral" variant="outline">Edit my profile</UButton>
    </div>

    <UAlert v-if="listsError" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(listsError, 'Your lists could not be loaded. They need a connection.')" />

    <MinistryMyLists v-if="lists && (lists.assigned.length || lists.ministries.length)" :data="lists" @changed="refreshLists()" />

    <section v-if="teaching?.sermons.length">
      <h2 class="text-2xl font-bold font-serif text-highlighted mb-4">My teaching</h2>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="sermon in teaching.sermons.slice(0, 5)" :key="sermon.id" class="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-highlighted leading-snug">{{ sermon.title }}</p>
              <p class="text-xs text-muted mt-0.5">{{ formatSermonDate(sermon.preachedOn) }}</p>
            </div>
            <UBadge variant="subtle" size="sm" :color="sermon.status === 'published' ? 'success' : 'warning'">{{ sermon.status === 'published' ? 'Published' : 'Draft' }}</UBadge>
          </li>
        </ul>
      </UCard>
      <p class="mt-3 text-sm">
        <NuxtLink to="/my-teaching" class="text-primary hover:underline">
          {{ teaching.sermons.length > 5 ? `All ${teaching.sermons.length} messages, and edit them` : 'Edit my messages' }}
        </NuxtLink>
      </p>
    </section>

    <section v-if="budgets?.ministries.length">
      <h2 class="text-2xl font-bold font-serif text-highlighted mb-4">Ministry budgets</h2>
      <ul class="flex flex-wrap gap-3">
        <li v-for="ministry in budgets.ministries" :key="ministry.slug">
          <UButton :to="`/ministry-budget/${ministry.slug}`" color="neutral" variant="outline" icon="i-lucide-wallet">{{ ministry.name }}</UButton>
        </li>
      </ul>
    </section>

    <p v-if="nothingWaiting" class="text-sm text-muted">Nothing is waiting for you right now: no tasks, lists, messages or ministry budgets.</p>
  </section>
</template>

<script setup lang="ts">
import type { MyListsPayload } from '#shared/ministry-lists'

// Fetched in the browser, and only for your own page. These endpoints answer for
// the signed-in person and take no person id, so there is no way to ask for
// someone else's. Browser-only also keeps them out of the page's HTML.
const { data: lists, error: listsError, status: listsStatus, refresh: refreshLists } = useFetch<MyListsPayload>('/api/me/lists', { server: false, lazy: true })
const { data: teaching, status: teachingStatus } = useFetch('/api/teaching/mine', { server: false, lazy: true })
const { data: budgets, status: budgetsStatus } = useFetch('/api/stewardship/ministries', { server: false, lazy: true })

const loaded = computed(() => [listsStatus.value, teachingStatus.value, budgetsStatus.value].every(status => status === 'success' || status === 'error'))
const nothingWaiting = computed(() => loaded.value && !listsError.value
  && !lists.value?.assigned.length && !lists.value?.ministries.length
  && !teaching.value?.sermons.length && !budgets.value?.ministries.length)
</script>
