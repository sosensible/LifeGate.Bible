<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Church Office</p>
        <h1 class="text-4xl font-bold font-serif text-white">Help</h1>
        <p class="text-white/70 mt-2 max-w-2xl">How to do the jobs the site is used for. You see the pages for the work you are allowed to do.</p>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Help could not be loaded.')" />

        <div v-else-if="!data?.topics.length" class="bg-muted border border-default rounded-lg p-8 text-center">
          <p class="text-toned">There are no help pages for your roles yet.</p>
        </div>

        <UPage v-else>
          <template #left>
            <UPageAside>
              <HelpContents :topics="data.topics" :query="query" @update:query="setQuery" />
            </UPageAside>
          </template>

          <!-- Narrow screens have no sidebar, so the search box and the
               contents list are in the page itself. -->
          <div class="lg:hidden mb-8">
            <HelpContents :topics="data.topics" :query="query" @update:query="setQuery" />
          </div>

          <HelpResults v-if="data.results" :results="data.results" :query="query" />

          <div v-else class="space-y-10">
            <section v-for="group in groups" :key="group.area">
              <h2 class="font-serif text-2xl font-bold text-highlighted mb-4">{{ group.area }}</h2>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NuxtLink
                  v-for="topic in group.topics"
                  :key="topic.slug"
                  :to="`/help/${topic.slug}`"
                  class="bg-elevated rounded-lg border border-default p-5 hover:border-primary transition-colors group"
                >
                  <h3 class="font-serif font-bold text-highlighted group-hover:text-primary transition-colors">{{ topic.title }}</h3>
                  <p class="text-toned text-sm mt-1">{{ topic.summary }}</p>
                </NuxtLink>
              </div>
            </section>
          </div>
        </UPage>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { groupByArea } from '#shared/help'

definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
// Office instructions are for the people who sign in, not for search engines.
useSeoMeta({ title: 'Help | Lifegate Baptist Church', robots: 'noindex, nofollow' })

const route = useRoute()
// The search stays in the address, so a page of results can be shared or reloaded.
const query = computed(() => (route.query.q as string | undefined) ?? '')
const setQuery = (value: string) =>
  navigateTo({ path: '/help', query: value ? { q: value } : {} }, { replace: true })

const { data, error } = await useFetch('/api/help', { query: { q: query } })
const groups = computed(() => groupByArea(data.value?.topics ?? []))
</script>
