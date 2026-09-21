<template>
  <!-- Search results, in the main column: one wide row per page, so a snippet
       reads as a sentence instead of a narrow ribbon of words. -->
  <section>
    <h2 class="font-serif text-2xl font-bold text-highlighted">
      {{ results.length }} {{ results.length === 1 ? 'page' : 'pages' }} for “{{ query }}”
    </h2>

    <div v-if="!results.length" class="bg-muted border border-default rounded-lg p-8 mt-4">
      <p class="text-toned">Nothing matched all of those words.</p>
      <p class="text-muted text-sm mt-2">Try one word, or a word that would be on the page itself, such as “check”, “designated” or “deposit”. Pages for work you are not allowed to do are not searched.</p>
    </div>

    <ul v-else class="mt-4 space-y-3">
      <li v-for="hit in results" :key="hit.slug">
        <NuxtLink
          :to="`/help/${hit.slug}`"
          class="block bg-elevated rounded-lg border border-default p-5 hover:border-primary transition-colors group"
        >
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 class="font-serif font-bold text-highlighted group-hover:text-primary transition-colors">{{ hit.title }}</h3>
            <span class="text-muted text-[10px] tracking-[0.15em] uppercase">{{ hit.area }}</span>
          </div>
          <p class="text-toned text-sm mt-1">{{ hit.summary }}</p>
          <p class="text-muted text-sm mt-2 leading-relaxed">{{ hit.snippet }}</p>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { HelpSearchHit } from '#shared/help'

defineProps<{ results: HelpSearchHit[], query: string }>()
</script>
