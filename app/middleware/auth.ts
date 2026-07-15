export default defineNuxtRouteMiddleware(() => {
  // v1 client-side gate: matches the invite-code login, which stores a token in
  // localStorage (auth store). Runs on the client only (localStorage isn't
  // available during SSR). Server-validated auth + role checks come with the
  // portal phase.
  if (import.meta.server) return

  if (!localStorage.getItem('auth_token')) {
    return navigateTo('/login')
  }
})
