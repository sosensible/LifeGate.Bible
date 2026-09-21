<template>
  <div class="min-h-screen bg-muted flex items-center justify-center p-6">
    <div class="w-full max-w-md bg-elevated rounded-lg shadow-lg p-10 sm:p-12 text-center">
      <SiteLogo sizes="120px" alt="Lifegate Baptist Church" class="h-20 w-auto mx-auto mb-6" />
      <h1 class="text-3xl font-bold text-primary mb-3 font-serif">Sign in to Lifegate</h1>

      <template v-if="token">
        <p class="text-toned text-sm leading-relaxed mb-8">Press the button to finish signing in on this device.</p>
        <!-- A click, not an automatic redirect: email scanners pre-open links, and
             an automatic sign-in would use up the single-use token. -->
        <UButton block size="lg" :loading="going" class="uppercase tracking-wide font-bold" @click="confirm">Sign in</UButton>
      </template>

      <template v-else>
        <p class="text-toned text-sm leading-relaxed mb-6">This sign-in link is incomplete. Request a new one.</p>
        <UButton to="/login" block size="lg">Back to sign in</UButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })
useSeoMeta({ title: 'Sign in | Lifegate Baptist Church', robots: 'noindex, nofollow' })

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const going = ref(false)

const confirm = () => {
  going.value = true
  // Absolute, on the site this page is open on. Better Auth resolves relative
  // callbacks against BETTER_AUTH_URL, which would send someone who signed in
  // through new.lifegate.bible to localhost. It accepts only trusted origins.
  const { origin } = window.location
  const params = new URLSearchParams({
    token: token.value,
    callbackURL: `${origin}/members`,
    errorCallbackURL: `${origin}/login`,
  })
  // Full navigation so the session cookie set by the verify redirect is sent
  // with the next server-rendered page.
  window.location.assign(`/api/auth/magic-link/verify?${params}`)
}
</script>
