<template>
  <div class="min-h-screen bg-[#ebe6d2] flex items-center justify-center p-6">
    <div class="w-full max-w-md">
      <div class="bg-white rounded-lg shadow-lg p-12">
        <h1 class="text-3xl font-bold text-[#1A5C30] mb-2 text-center font-serif">Member Access</h1>
        <p class="text-center text-[#5C4230] mb-6 text-sm">Enter your credentials to access the members portal.</p>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-[#5C4230] uppercase tracking-wide mb-2">Email</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="your@email.com"
              class="w-full px-4 py-3 border border-[#C8B89A] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5C30]"
              required
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-[#5C4230] uppercase tracking-wide mb-2">Password</label>
            <input
              v-model="form.password"
              type="password"
              placeholder="••••••••"
              class="w-full px-4 py-3 border border-[#C8B89A] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5C30]"
              required
            />
          </div>

          <div v-if="error" class="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {{ error }}
          </div>

          <UButton
            type="submit"
            :loading="loading"
            class="w-full bg-[#1A5C30] hover:bg-[#154a27] text-white font-bold py-3 rounded uppercase tracking-wide"
          >
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </UButton>
        </form>

        <p class="text-center mt-6">
          <NuxtLink to="/" class="text-[#5C4230] text-sm hover:underline">← Back to main site</NuxtLink>
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
