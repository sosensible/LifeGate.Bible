<template>
  <div class="min-h-screen bg-muted flex items-center justify-center p-6">
    <div class="w-full max-w-md">
      <div class="bg-elevated rounded-lg shadow-lg p-12">
        <img src="/logo.png" alt="Lifegate Baptist Church" class="h-24 w-auto mx-auto mb-6" />
        <p class="text-center text-gold-600 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Only</p>
        <h1 class="text-3xl font-bold text-primary mb-2 text-center font-serif">Member Access</h1>
        <p class="text-center text-toned mb-6 text-sm leading-relaxed">
          Enter your church invite code to access the members portal. Contact your administrator if you need a code.
        </p>

        <div class="h-px bg-default mb-6"></div>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-toned uppercase tracking-wide mb-2">Invite Code</label>
            <input
              v-model="inviteCode"
              type="text"
              placeholder="Enter your invite code"
              class="w-full px-4 py-3 bg-default text-default border border-default rounded text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div v-if="error" class="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {{ error }}
          </div>

          <UButton
            type="submit"
            :loading="loading"
            class="w-full justify-center bg-primary hover:bg-primary-800 text-white font-bold py-3 rounded uppercase tracking-wide"
          >
            {{ loading ? 'Verifying...' : 'Enter Members Area' }}
          </UButton>
        </form>

        <p class="text-center mt-6">
          <NuxtLink to="/" class="text-toned text-sm hover:underline">← Back to main site</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const auth = useAuthStore()
const inviteCode = ref('')
const error = ref('')
const loading = ref(false)

const handleLogin = async () => {
  error.value = ''
  loading.value = true
  try {
    await auth.loginWithInviteCode(inviteCode.value)
    await navigateTo('/sermons')
  }
  catch (err: any) {
    error.value = err.message || 'Invalid invite code.'
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  auth.initAuth()
  if (auth.isAuthenticated) {
    navigateTo('/sermons')
  }
})
</script>
