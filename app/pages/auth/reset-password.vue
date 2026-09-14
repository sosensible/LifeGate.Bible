<template>
  <div class="min-h-screen bg-muted flex items-center justify-center p-6">
    <div class="w-full max-w-md bg-elevated rounded-lg shadow-lg p-10 sm:p-12">
      <img src="/logo.png" alt="Lifegate Baptist Church" class="h-20 w-auto mx-auto mb-6" />
      <h1 class="text-3xl font-bold text-primary mb-3 font-serif text-center">Choose a Password</h1>

      <template v-if="done">
        <UAlert color="primary" variant="subtle" icon="i-lucide-check" description="Your password is set." class="mb-6" />
        <UButton to="/login" block size="lg" class="uppercase tracking-wide font-bold">Sign in</UButton>
      </template>

      <template v-else-if="!token">
        <p class="text-toned text-sm text-center leading-relaxed mb-6">This reset link has expired or was already used.</p>
        <UButton to="/login" block size="lg">Request a new link</UButton>
      </template>

      <template v-else>
        <p class="text-toned text-sm text-center leading-relaxed mb-6">Use at least 12 characters. A short phrase is easier to remember than a jumble.</p>
        <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage" class="mb-5" />
        <UForm :schema="schema" :state="state" class="space-y-4" @submit="save">
          <UFormField label="New password" name="password">
            <UInput v-model="state.password" type="password" autocomplete="new-password" class="w-full" />
          </UFormField>
          <UFormField label="Confirm new password" name="confirm">
            <UInput v-model="state.confirm" type="password" autocomplete="new-password" class="w-full" />
          </UFormField>
          <UButton type="submit" block size="lg" :loading="busy" class="uppercase tracking-wide font-bold">Save password</UButton>
        </UForm>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ layout: false })
useSeoMeta({ title: 'Choose a password | Lifegate Baptist Church', robots: 'noindex, nofollow' })

const route = useRoute()
// Better Auth appends ?token=... on success, or ?error=INVALID_TOKEN on failure.
const token = computed(() => (typeof route.query.token === 'string' && !route.query.error ? route.query.token : ''))

const state = reactive({ password: '', confirm: '' })
const busy = ref(false)
const done = ref(false)
const errorMessage = ref('')

const schema = z.object({
  password: z.string().min(12, 'Use at least 12 characters'),
  confirm: z.string(),
}).refine(value => value.password === value.confirm, { message: 'The passwords do not match', path: ['confirm'] })

const save = async () => {
  busy.value = true
  errorMessage.value = ''
  const { error } = await authClient.resetPassword({ newPassword: state.password, token: token.value })
  busy.value = false

  if (error) {
    errorMessage.value = error.code === 'INVALID_TOKEN'
      ? 'This reset link has expired or was already used. Request a new one.'
      : 'That password could not be saved. Please try again.'
    return
  }
  done.value = true
}
</script>
