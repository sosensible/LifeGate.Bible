<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Live</p>
        <h1 class="text-4xl font-bold font-serif text-white">{{ view?.title ?? 'Broadcast' }}</h1>
        <p v-if="view?.description" class="text-white/70 mt-2 max-w-2xl">{{ view.description }}</p>
      </div>
    </div>

    <div class="bg-parchment-900 py-10 px-6">
      <div class="max-w-5xl mx-auto space-y-4">
        <!-- The stream, once the person has been let in -->
        <div v-if="view?.embedUrl" class="relative aspect-video rounded-lg overflow-hidden bg-black">
          <iframe
            :src="view.embedUrl"
            :title="view.title"
            class="absolute inset-0 w-full h-full border-0"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowfullscreen
            referrerpolicy="no-referrer"
          />
        </div>

        <UAlert v-else-if="loadError" color="error" variant="subtle" icon="i-lucide-circle-alert" title="This broadcast could not be found" description="Check the address you were given." />

        <template v-else-if="view">
          <UAlert v-if="view.availability === 'closed'" color="neutral" variant="subtle" icon="i-lucide-circle-check" title="This broadcast has ended" description="Thank you for watching." />
          <UAlert v-else-if="view.full" color="warning" variant="subtle" icon="i-lucide-users" title="All the places are taken" description="This broadcast has a limit on how many people can watch, and it has been reached." />

          <!-- Not in yet -->
          <UCard v-else-if="view.needs === 'sign-in'">
            <p class="text-toned mb-4">This broadcast is for members. Sign in to watch.</p>
            <UButton :to="{ path: '/login', query: { redirect: route.fullPath } }" icon="i-lucide-log-in">Sign in</UButton>
          </UCard>
          <UAlert v-else-if="view.needs === 'members'" color="neutral" variant="subtle" icon="i-lucide-lock" title="This broadcast is for members" description="Your account is not a member account yet. Ask the church office." />
          <UCard v-else-if="view.needs === 'code'">
            <form class="space-y-4 max-w-sm" @submit.prevent="enter">
              <UFormField label="Your code" help="The code the church office made for you. Each code is for one person, on one device.">
                <UInput v-model="code" placeholder="XXXXX-XXXXX" autocomplete="off" autocapitalize="characters" size="lg" class="w-full" :ui="{ base: 'tracking-widest uppercase' }" />
              </UFormField>
              <UAlert v-if="problem" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="problem" />
              <UButton type="submit" icon="i-lucide-play" :loading="entering" :disabled="!code.trim()">Watch</UButton>
            </form>
            <p class="text-muted text-sm mt-5">A member? <NuxtLink :to="{ path: '/login', query: { redirect: route.fullPath } }" class="text-primary hover:underline">Sign in</NuxtLink> instead; no code needed.</p>
          </UCard>

          <!-- In, but it has not opened -->
          <UAlert v-else color="info" variant="subtle" icon="i-lucide-clock" title="This broadcast has not started yet" description="Keep this page open. It opens by itself when the broadcast begins." />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WatchView } from '#shared/broadcast'

definePageMeta({ layout: 'default' })

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const view = ref<WatchView | null>(null)
// During server rendering a plain $fetch carries no cookies, so this forwards the visitor's own.
const api = useRequestFetch()
const loadError = ref(false)

const load = async () => {
  try {
    view.value = await api<WatchView>(`/api/broadcasts/${encodeURIComponent(slug.value)}`)
    loadError.value = false
  }
  catch {
    loadError.value = true
  }
}
await load()
useSeoMeta({ title: () => view.value?.title ?? 'Broadcast', robots: 'noindex' })

// Until it opens, look again every 20 seconds, so a person waiting on this page is let in as it starts.
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    if (view.value && !view.value.embedUrl && view.value.availability === 'not-open' && view.value.needs === null) void load()
  }, 20000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const code = ref('')
const problem = ref('')
const entering = ref(false)
const enter = async () => {
  entering.value = true
  problem.value = ''
  try {
    view.value = await $fetch<WatchView>(`/api/broadcasts/${encodeURIComponent(slug.value)}/enter`, { method: 'POST', body: { code: code.value } })
  }
  catch (error) {
    problem.value = apiErrorMessage(error, 'That did not work. Try again.')
  }
  finally {
    entering.value = false
  }
}
</script>
