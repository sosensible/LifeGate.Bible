<template>
  <div class="min-h-screen bg-muted flex items-center justify-center p-6">
    <div class="w-full max-w-md">
      <div class="bg-elevated rounded-lg shadow-lg p-10 sm:p-12">
        <img src="/logo.png" alt="Lifegate Baptist Church" class="h-24 w-auto mx-auto mb-6" />
        <p class="text-center text-gold-600 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Only</p>
        <h1 class="text-3xl font-bold text-primary mb-2 text-center font-serif">{{ copy.heading }}</h1>
        <p class="text-center text-toned mb-6 text-sm leading-relaxed">{{ copy.intro }}</p>

        <div class="h-px bg-default mb-6" />

        <UAlert v-if="notice" color="primary" variant="subtle" icon="i-lucide-mail-check" :description="notice" class="mb-5" />
        <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage" class="mb-5" />

        <UForm v-if="mode === 'password'" :schema="passwordSchema" :state="state" class="space-y-4" @submit="signInWithPassword">
          <UFormField label="Email" name="email">
            <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
          </UFormField>
          <UFormField label="Password" name="password">
            <UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" />
          </UFormField>
          <UButton type="submit" block size="lg" :loading="busy" class="uppercase tracking-wide font-bold">Sign in</UButton>
        </UForm>

        <UForm v-else :schema="emailSchema" :state="state" class="space-y-4" @submit="sendEmail">
          <UFormField label="Email" name="email">
            <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
          </UFormField>
          <UButton type="submit" block size="lg" :loading="busy" class="uppercase tracking-wide font-bold">{{ copy.action }}</UButton>
        </UForm>

        <div class="mt-6 flex flex-col items-center gap-2 text-sm">
          <UButton v-if="mode !== 'magic'" variant="link" color="primary" @click="switchMode('magic')">Email me a sign-in link instead</UButton>
          <UButton v-if="mode !== 'password'" variant="link" color="primary" @click="switchMode('password')">Sign in with my password</UButton>
          <UButton v-if="mode === 'password'" variant="link" color="neutral" @click="switchMode('forgot')">Forgot password?</UButton>
        </div>

        <p class="text-center mt-6">
          <NuxtLink to="/" class="text-toned text-sm hover:underline">← Back to main site</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ layout: false })
useSeoMeta({ title: 'Member sign in | Lifegate Baptist Church' })

type Mode = 'password' | 'magic' | 'forgot'

const auth = useAuthStore()
const route = useRoute()
const redirectTo = useSafeRedirect()

if (auth.isAuthenticated) {
  await navigateTo(redirectTo.value)
}

const mode = ref<Mode>('password')
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')
const state = reactive({ email: '', password: '' })

const emailSchema = z.object({ email: z.email('Enter a valid email address') })
const passwordSchema = emailSchema.extend({ password: z.string().min(1, 'Enter your password') })

const copy = computed(() => ({
  password: { heading: 'Member Access', intro: 'Sign in with your email and password.', action: 'Sign in' },
  magic: { heading: 'Email Sign-in', intro: 'We will email you a link that signs you in. No password needed.', action: 'Email me a sign-in link' },
  forgot: { heading: 'Reset Password', intro: 'We will email you a link to choose a new password.', action: 'Email me a reset link' },
}[mode.value]))

// Better Auth sends people back here with ?error=CODE when a link fails.
if (typeof route.query.error === 'string') {
  errorMessage.value = 'That link has expired or was already used. Request a new one below.'
  mode.value = 'magic'
}

const switchMode = (next: Mode) => {
  mode.value = next
  notice.value = ''
  errorMessage.value = ''
}

const signInWithPassword = async () => {
  busy.value = true
  errorMessage.value = ''
  const { error } = await authClient.signIn.email({ email: state.email, password: state.password })
  busy.value = false

  if (error) {
    // Deliberately the same message whether the email or the password is wrong.
    errorMessage.value = 'That email and password do not match an account.'
    return
  }
  await auth.refresh()
  await navigateTo(redirectTo.value)
}

// Same confirmation whether or not an account exists, so this form cannot be
// used to discover who is a member.
const sendEmail = async () => {
  busy.value = true
  errorMessage.value = ''
  const { error } = mode.value === 'magic'
    ? await authClient.signIn.magicLink({ email: state.email, callbackURL: redirectTo.value })
    // Absolute, so the reset link returns to this site rather than BETTER_AUTH_URL.
    : await authClient.requestPasswordReset({ email: state.email, redirectTo: `${window.location.origin}/auth/reset-password` })
  busy.value = false

  if (error) {
    errorMessage.value = 'Something went wrong sending that email. Please try again in a moment.'
    return
  }
  notice.value = `If ${state.email} has a Lifegate account, we have sent it a link. Check your inbox.`
}
</script>
