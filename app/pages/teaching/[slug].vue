<template>
  <div v-if="sermon">
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-5xl mx-auto">
        <NuxtLink to="/teaching" class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase inline-flex items-center gap-1.5 hover:underline">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          All Messages
        </NuxtLink>
        <p v-if="sermon.series" class="text-white/60 text-xs uppercase tracking-wide mt-4">{{ sermon.series.name }}</p>
        <div class="flex flex-wrap items-start justify-between gap-4 mt-1">
          <h1 class="text-4xl font-bold font-serif text-white">{{ sermon.title }}</h1>
          <UButton v-if="isTeacher" variant="outline" class="text-white ring-white/40 hover:bg-white/10" icon="i-lucide-pencil" :loading="opening" @click="openEditor">Edit your message</UButton>
        </div>
        <p class="text-white/70 mt-2">
          <span v-if="sermon.scripture" class="text-gold-300 font-semibold">{{ sermon.scripture }} · </span>
          {{ formatSermonDate(sermon.preachedOn) }} · {{ sermon.speaker }}
        </p>
      </div>
    </div>

    <div class="bg-parchment-900 py-10 px-6">
      <div class="max-w-5xl mx-auto space-y-4">
        <!-- The only warning block on a dark panel. Warning text is darkened
             app-wide for contrast on light surfaces (see app.config.ts); here
             that would read as brown on brown, so it keeps the light amber. -->
        <UAlert
          v-if="sermon.status === 'draft'"
          color="warning"
          variant="subtle"
          icon="i-lucide-eye-off"
          :ui="{ root: 'text-warning-500' }"
          title="Draft preview"
          :description="isTeacher ? 'Only you and the people who manage teaching can see this. It is not on the Teaching page yet.' : 'Only people who manage teaching can see this. It is not on the Teaching page yet.'"
        />
        <SermonPlayer :sermon="sermon" />
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
        <div class="md:col-span-2">
          <p v-if="sermon.description" class="text-toned leading-relaxed whitespace-pre-line">{{ sermon.description }}</p>
          <p v-else class="text-muted">No notes for this message yet.</p>
        </div>
        <aside class="space-y-5 text-sm">
          <div v-if="sermon.books.length">
            <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase mb-1">Books</p>
            <div class="flex flex-wrap gap-1.5">
              <UButton v-for="book in sermon.books" :key="book" :to="{ path: '/teaching', query: { book } }" size="xs" variant="soft" color="neutral">{{ book }}</UButton>
            </div>
          </div>
          <div v-if="sermon.tags.length">
            <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase mb-1">Topics</p>
            <div class="flex flex-wrap gap-1.5">
              <UButton v-for="tag in sermon.tags" :key="tag" :to="{ path: '/teaching', query: { tag } }" size="xs" variant="soft" color="neutral">{{ tag }}</UButton>
            </div>
          </div>
          <div v-if="sermon.series">
            <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase mb-1">Series</p>
            <NuxtLink :to="{ path: '/teaching', query: { series: sermon.series.name } }" class="text-primary hover:underline">More from {{ sermon.series.name }}</NuxtLink>
          </div>
          <UBadge v-if="sermon.visibility === 'members'" variant="subtle" color="neutral" icon="i-lucide-lock">Members only</UBadge>
        </aside>
      </div>
    </div>
    <TeachingEditor v-model:open="editorOpen" :sermon="editing" :series="mine?.series ?? []" @saved="refreshNuxtData()" />
  </div>
</template>
<script setup lang="ts">
import type { AdminSermonView } from '#shared/sermons'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data, error } = await useFetch(() => `/api/sermons/${encodeURIComponent(slug.value)}`)
const sermon = computed(() => data.value?.sermon ?? null)
const isTeacher = computed(() => Boolean(data.value?.isTeacher))

// The message's own teacher edits its details here.
const editorOpen = ref(false)
const opening = ref(false)
const mine = ref<{ sermons: AdminSermonView[], series: Array<{ id: string, name: string }> } | null>(null)
const editing = computed(() => mine.value?.sermons.find(s => s.slug === slug.value) ?? null)
const openEditor = async () => {
  opening.value = true
  try {
    mine.value = await $fetch('/api/teaching/mine')
    editorOpen.value = true
  }
  finally {
    opening.value = false
  }
}

// A members-only message: send signed-out visitors to sign in and back here.
if (error.value?.statusCode === 401) {
  await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
}
else if (error.value) {
  const statusCode = error.value.statusCode ?? 500
  throw createError({
    statusCode,
    statusMessage: statusCode === 403 ? 'This message is for members' : statusCode === 404 ? 'Message not found' : 'Could not load this message',
    fatal: true,
  })
}

useSeoMeta({
  title: () => `${sermon.value?.title ?? 'Message'} | Lifegate Baptist Church`,
  description: () => sermon.value?.description?.slice(0, 160) ?? undefined,
})
</script>
