export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ email: string; name: string } | null>(null)
  const token = ref<string>('')

  const isAuthenticated = computed(() => !!token.value)

  const login = async (email: string, password: string) => {
    const { data, error } = await useFetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })

    if (error.value) {
      throw new Error(error.value.message || 'Login failed')
    }

    if (data.value) {
      token.value = data.value.token
      user.value = data.value.user
      if (process.client) {
        localStorage.setItem('auth_token', data.value.token)
      }
    }
  }

  const logout = () => {
    user.value = null
    token.value = ''
    if (process.client) {
      localStorage.removeItem('auth_token')
    }
  }

  const initAuth = () => {
    if (process.client) {
      const stored = localStorage.getItem('auth_token')
      if (stored) {
        token.value = stored
      }
    }
  }

  return { user, token, isAuthenticated, login, logout, initAuth }
})
