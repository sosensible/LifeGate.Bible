<template>
  <div>
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <NuxtLink to="/ministries" class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2 inline-flex items-center gap-1.5 hover:underline">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          All Ministries
        </NuxtLink>
        <h1 class="text-4xl font-bold font-serif text-white mt-2">{{ ministry?.name ?? 'Ministry' }}</h1>
      </div>
    </div>

    <template v-if="ministry">
      <!-- Description -->
      <div class="bg-parchment-900 py-8 px-6">
        <div class="max-w-6xl mx-auto">
          <p class="text-toned max-w-2xl leading-relaxed">{{ ministry.description }}</p>
        </div>
      </div>

      <!-- Members serving (members only) -->
      <div class="bg-default py-10 px-6">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-2xl font-bold font-serif text-highlighted mb-6">
            Serving in this Ministry
            <span v-if="auth.isAuthenticated" class="text-muted text-base font-sans font-normal">({{ ministry.members.length }})</span>
          </h2>

          <!-- Public: roster is members-only -->
          <div v-if="!auth.isAuthenticated" class="bg-muted border border-default rounded-lg p-8 text-center">
            <UIcon name="i-lucide-lock" class="w-6 h-6 text-gold-600 mx-auto mb-3" />
            <p class="text-toned mb-4 max-w-md mx-auto">The list of members serving in this ministry is available to signed-in members. Sign in to see who serves here.</p>
            <div class="flex gap-3 justify-center flex-wrap">
              <UButton to="/login" color="secondary">Member Login</UButton>
              <UButton
                variant="outline"
                color="primary"
                :to="'mailto:info@lifegate.bible?subject=Serving%20at%20Lifegate'"
              >
                I'd Like to Serve
              </UButton>
            </div>
          </div>

          <!-- Members: empty roster -->
          <div v-else-if="ministry.members.length === 0" class="bg-muted border border-default rounded-lg p-8 text-center">
            <p class="text-toned mb-3">We're looking for people to serve in this ministry.</p>
            <UButton
              variant="outline"
              color="primary"
              :to="'mailto:info@lifegate.bible?subject=Serving%20at%20Lifegate'"
            >
              I'd Like to Serve
            </UButton>
          </div>

          <!-- Members: roster -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div v-for="m in ministry.members" :key="m.id" class="bg-elevated rounded-lg border border-default shadow-sm p-5 flex gap-3.5 items-center">
              <div class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white font-bold" :style="{ backgroundColor: m.color }">{{ m.initials }}</div>
              <div class="min-w-0">
                <h3 class="font-serif font-bold text-highlighted leading-tight">{{ m.name }}</h3>
                <p class="text-muted text-[11px] uppercase tracking-wide">{{ m.role }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Unknown ministry -->
    <div v-else class="bg-default py-16 px-6 text-center">
      <p class="font-serif text-xl text-muted mb-2">Ministry not found</p>
      <NuxtLink to="/ministries" class="text-primary text-sm hover:underline">Back to all ministries</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ministryBySlug } from '~/data/directory'

// Public page. Name + description show to everyone; the roster (who serves) is
// gated to signed-in members.
definePageMeta({
  layout: 'default',
})

const auth = useAuthStore()

onMounted(() => {
  auth.initAuth()
})

const route = useRoute()
const ministry = computed(() => ministryBySlug(String(route.params.slug)))

// An unknown slug must be a real 404, not a 200 with an empty shell. Previously
// this rendered the header with a 'Ministry' placeholder and no body, which
// search engines treat as a soft-404 / thin duplicate page. Thrown during setup
// so SSR sends the status code, not just the client.
if (!ministry.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Ministry not found',
    fatal: true,
  })
}
</script>
