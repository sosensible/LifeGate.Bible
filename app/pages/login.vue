<template>
  <div class="min-h-screen bg-muted flex items-center justify-center p-6">
    <div class="w-full max-w-md">
      <div class="bg-elevated rounded-lg shadow-lg p-12">
        <img src="/logo.png" alt="Lifegate Baptist Church" class="h-24 w-auto mx-auto mb-6" />
        <h1 class="text-3xl font-bold text-primary mb-2 text-center font-serif">Member Access</h1>
        <p class="text-center text-toned mb-6 text-sm">Enter your credentials to access the members portal.</p>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-toned uppercase tracking-wide mb-2">Email</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="your@email.com"
              class="w-full px-4 py-3 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-toned uppercase tracking-wide mb-2">Password</label>
            <input
              v-model="form.password"
              type="password"
              placeholder="••••••••"
              class="w-full px-4 py-3 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div v-if="error" class="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {{ error }}
          </div>

          <UButton
            type="submit"
            :loading="loading"
            class="w-full bg-primary hover:bg-primary-800 text-white font-bold py-3 rounded uppercase tracking-wide"
          >
            {{ loading ? 'Signing in...' : 'Sign In' }}
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
const form = reactive({ email: '', password: '' })
const error = ref('')
const loading = ref(false)

const handleLogin = async () => {
  error.value = ''
  loading.value = true

  try {
    await auth.login(form.email, form.password)
    await navigateTo('/sermons')
  }
  catch (err: any) {
    error.value = err.message || 'Login failed'
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
