<template>
  <div class="bg-default px-6 py-8">
    <div class="max-w-6xl mx-auto">
      <UPage v-if="data">
        <template #left>
          <UPageAside>
            <HelpContents :topics="data.topics" :query="query" :current="data.page.slug" @update:query="setQuery" />
          </UPageAside>
        </template>

        <UBreadcrumb :items="[{ label: 'Help', to: '/help' }, { label: data.page.area }, { label: data.page.title }]" class="mb-4" />
        <h1 class="font-serif text-3xl font-bold text-highlighted">{{ data.page.title }}</h1>
        <p class="text-toned mt-2">{{ data.page.summary }}</p>

        <!-- Narrow screens: this page's sections, then the whole contents list at the end. -->
        <nav v-if="data.page.sections.length" class="lg:hidden mt-6 border-s-2 border-default ps-4 space-y-1">
          <a v-for="section in data.page.sections" :key="section.id" :href="`#${section.id}`" class="block text-sm text-toned hover:text-primary" :class="{ 'ps-3': section.depth === 3 }">{{ section.label }}</a>
        </nav>

        <article class="help-prose mt-8" v-html="data.page.html" />

        <div class="lg:hidden mt-12 pt-8 border-t border-default">
          <HelpContents :topics="data.topics" :query="query" :current="data.page.slug" @update:query="setQuery" />
        </div>

        <template #right>
          <UPageAside>
            <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase mb-2">On this page</p>
            <UPageAnchors :links="anchors" />
          </UPageAside>
        </template>
      </UPage>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

const route = useRoute()
const slug = computed(() => route.params.slug as string)
const { data } = await useFetch(() => `/api/help/${slug.value}`)

useSeoMeta({
  title: () => `${data.value?.page.title ?? 'Help'} | Lifegate Baptist Church`,
  robots: 'noindex, nofollow',
})

const anchors = computed(() => (data.value?.page.sections ?? []).map(section => ({
  label: section.label,
  to: `#${section.id}`,
  class: section.depth === 3 ? 'ps-3' : undefined,
})))

// Searching from a topic page takes you to the results on the Help page.
const query = ref('')
const setQuery = (value: string) => navigateTo({ path: '/help', query: value ? { q: value } : {} })
</script>

<style scoped>
/* House styling for the rendered Markdown. */
.help-prose :deep(h2) {
  font-family: var(--font-serif, serif);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ui-text-highlighted);
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
  scroll-margin-top: 90px;
}
.help-prose :deep(h3) {
  font-weight: 700;
  color: var(--ui-text-highlighted);
  margin-top: 1.75rem;
  margin-bottom: 0.5rem;
  scroll-margin-top: 90px;
}
.help-prose :deep(p),
.help-prose :deep(li) {
  color: var(--ui-text-toned);
  line-height: 1.7;
}
.help-prose :deep(p) {
  margin-bottom: 1rem;
}
.help-prose :deep(ul),
.help-prose :deep(ol) {
  margin: 0 0 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.help-prose :deep(ul) {
  list-style: disc;
}
.help-prose :deep(ol) {
  list-style: decimal;
}
.help-prose :deep(li > ul),
.help-prose :deep(li > ol) {
  margin-top: 0.375rem;
  margin-bottom: 0;
}
.help-prose :deep(strong) {
  color: var(--ui-text-highlighted);
  font-weight: 700;
}
.help-prose :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}
.help-prose :deep(code) {
  background: var(--ui-bg-muted);
  border: 1px solid var(--ui-border);
  border-radius: 0.25rem;
  padding: 0.05rem 0.3rem;
  font-size: 0.875em;
}
.help-prose :deep(blockquote) {
  border-inline-start: 3px solid var(--ui-border-accented);
  padding-inline-start: 1rem;
  margin-bottom: 1rem;
  color: var(--ui-text-muted);
}
.help-prose :deep(table) {
  /* Block, so a wide table scrolls sideways on a phone instead of stretching the page. */
  display: block;
  overflow-x: auto;
  width: 100%;
  margin-bottom: 1.5rem;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.help-prose :deep(th),
.help-prose :deep(td) {
  border: 1px solid var(--ui-border);
  padding: 0.5rem 0.75rem;
  text-align: start;
  color: var(--ui-text-toned);
  vertical-align: top;
}
.help-prose :deep(th) {
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted);
}
.help-prose :deep(hr) {
  border-color: var(--ui-border);
  margin: 2rem 0;
}
</style>
