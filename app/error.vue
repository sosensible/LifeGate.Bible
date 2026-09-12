<template>
  <NuxtLayout name="default">
    <section class="bg-muted grow py-24 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-primary text-xs font-bold tracking-[0.2em] uppercase mb-4">
          Error {{ statusCode }} &mdash; {{ eyebrow }}
        </p>

        <h1 class="text-5xl sm:text-6xl md:text-7xl font-bold font-serif text-highlighted leading-[1.05] mb-6">
          {{ headline }}<br><span class="text-secondary italic">{{ headlineAccent }}</span>
        </h1>

        <div class="flex items-center gap-4 mb-6">
          <div class="h-0.5 w-12 bg-gold-500 shrink-0"></div>
          <span class="text-toned text-sm italic">{{ verse.text }} &mdash; {{ verse.ref }}</span>
        </div>

        <p class="text-lg text-toned leading-relaxed max-w-xl mb-9">{{ body }}</p>

        <div class="flex gap-4 flex-wrap">
          <UButton
            color="primary"
            size="xl"
            class="uppercase tracking-wide font-bold"
            @click="goTo('/')"
          >
            Return Home
          </UButton>
          <UButton
            color="secondary"
            variant="outline"
            size="xl"
            class="uppercase tracking-wide font-bold"
            @click="goTo(isNotFound ? '/ministries' : '/contact')"
          >
            {{ isNotFound ? 'Browse Ministries' : 'Contact Us' }}
          </UButton>
        </div>

        <!-- Dev-only diagnostics. Never shown to visitors: a church error page
             should not expose internals, and the real detail is in the logs. -->
        <div v-if="showDetails" class="mt-12 border-t border-default pt-6">
          <p class="text-xs font-bold tracking-[0.2em] uppercase text-toned mb-3">
            Development detail
          </p>
          <pre class="text-xs text-toned whitespace-pre-wrap break-words font-mono">{{ error?.message }}</pre>
        </div>
      </div>
    </section>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'

// Branded replacement for Nuxt's built-in error page, which ships a dark navy
// layout and a "| Nuxt" title -- both wrong for a light-only church site.
const props = defineProps<{ error?: NuxtError }>()

const statusCode = computed(() => props.error?.statusCode ?? 500)
const isNotFound = computed(() => statusCode.value === 404)

// A thrown createError can carry a specific statusMessage (e.g. 'Ministry not
// found' from app/pages/ministries/[slug].vue). Prefer it over the generic label.
//
// But Nuxt's own route-miss sets 'Page not found: /whatever-they-typed', which
// would splice a raw, visitor-controlled path into the heading and <title>.
// Reject anything carrying a path and fall back to the generic label.
const eyebrow = computed(() => {
  const specific = props.error?.statusMessage?.trim()
  const generic = isNotFound.value ? 'Page Not Found' : 'Server Error'
  if (!specific || specific.includes('/')) return generic
  return specific
})

const headline = computed(() => (isNotFound.value ? 'We could not' : 'Something'))
const headlineAccent = computed(() => (isNotFound.value ? 'find that page.' : 'went wrong.'))

// KJV, public domain -- matches the Scripture callouts on the homepage and the
// ministries index.
const verse = computed(() =>
  isNotFound.value
    ? { text: '"Seek, and ye shall find."', ref: 'Matthew 7:7' }
    : { text: '"Be still, and know that I am God."', ref: 'Psalm 46:10' },
)

const body = computed(() =>
  isNotFound.value
    ? 'The page you were looking for may have moved, or the link may be mistaken. You are welcome to start again from the home page, or reach out and we will gladly point you the right way.'
    : 'Our apologies -- something failed on our end, not yours. Please try again in a moment. If it keeps happening, let us know and we will look into it.',
)

const showDetails = computed(() => import.meta.dev && !!props.error?.message)

// clearError resets Nuxt's error state; navigating without it leaves the app
// stuck on this page.
const goTo = (path: string) => clearError({ redirect: path })

useSeoMeta({
  title: `${statusCode.value} ${eyebrow.value} | Lifegate Baptist Church`,
  // Error pages must never be indexed, whatever robots.txt says.
  robots: 'noindex, nofollow',
})
</script>
