<template>
  <!-- The contents list, on every help page: search, then every topic this
       person can read, grouped by area. Results are shown in the main column,
       by HelpResults, where there is room for them. -->
  <div class="space-y-4">
    <UInput
      v-model="text"
      icon="i-lucide-search"
      placeholder="Search help..."
      class="w-full"
      :ui="{ trailing: 'pe-1' }"
    >
      <template v-if="text" #trailing>
        <UButton size="xs" variant="link" color="neutral" icon="i-lucide-x" aria-label="Clear the search" @click="clear" />
      </template>
    </UInput>

    <nav class="space-y-5">
      <div v-for="group in groups" :key="group.area">
        <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase mb-2">{{ group.area }}</p>
        <ul class="space-y-1 border-s border-default">
          <li v-for="topic in group.topics" :key="topic.slug">
            <NuxtLink
              :to="`/help/${topic.slug}`"
              class="block -ms-px ps-3 py-1 text-sm border-s-2 transition-colors"
              :class="topic.slug === current
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-toned hover:text-highlighted hover:border-default'"
            >
              {{ topic.title }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { groupByArea, type HelpTopic } from '#shared/help'

const props = defineProps<{
  topics: HelpTopic[]
  query: string
  current?: string
}>()
const emit = defineEmits<{ 'update:query': [value: string] }>()

const groups = computed(() => groupByArea(props.topics))

// The box keeps its own text, so it answers at once: clearing it empties the box
// whether or not the search behind it has caught up. Typing is passed on a
// moment later, so one search runs per pause and not one per letter.
const text = ref(props.query)
watch(() => props.query, (value) => {
  if (value !== text.value) text.value = value
})

let pending: ReturnType<typeof setTimeout> | undefined
watch(text, (value) => {
  clearTimeout(pending)
  if (value === props.query) return
  pending = setTimeout(() => emit('update:query', value.trim()), 300)
})
onBeforeUnmount(() => clearTimeout(pending))

const clear = () => {
  clearTimeout(pending)
  text.value = ''
  emit('update:query', '')
}
</script>
