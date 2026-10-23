<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Serving</p>
        <h1 class="text-4xl font-bold font-serif text-white">My lists</h1>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-10">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Your lists could not be loaded.')" />

        <UEmpty
          v-else-if="!data?.ministries.length && status !== 'pending'"
          icon="i-lucide-list-checks"
          title="Nothing here yet"
          description="When a ministry you serve in starts a list, or gives you a task, it appears here, so you don't have to look through each ministry’s page."
        />

        <MinistryMyLists v-else-if="data" :data="data" @changed="refresh()" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MyListsPayload } from '#shared/ministry-lists'

definePageMeta({ middleware: 'auth', layout: 'default' })
useSeoMeta({ title: 'My lists' })

const { data, error, status, refresh } = await useFetch<MyListsPayload>('/api/me/lists')
</script>
