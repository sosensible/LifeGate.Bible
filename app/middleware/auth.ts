export default defineNuxtRouteMiddleware(async (to, from) => {
  const token = useCookie('auth_token').value

  if (!token) {
    return navigateTo('/login')
  }

  try {
    const { data } = await useFetch('/api/auth/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    const user = data.value as any

    if (to.path.startsWith('/admin') && user.role !== 'admin' && user.role !== 'pastor') {
      return navigateTo('/')
    }
  }
  catch (err) {
    return navigateTo('/login')
  }
})
