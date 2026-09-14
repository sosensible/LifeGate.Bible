// Guards member and staff pages. Runs during SSR as well as in the browser,
// because the session now comes from an httpOnly cookie rather than
// localStorage, so the server can refuse to render a gated page at all.
export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore()

  if (!auth.isAuthenticated) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  const required = to.meta.permission ?? { memberArea: ['view'] }
  if (!auth.can(required)) {
    return abortNavigation(createError({ statusCode: 403, statusMessage: 'Not allowed' }))
  }
})
