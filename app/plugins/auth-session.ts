// Load the session once per request, during SSR, with the visitor's cookie.
// On the client this reuses the SSR payload instead of fetching again.
export default defineNuxtPlugin(async () => {
  const auth = useAuthStore()
  const { data } = await authClient.useSession(useFetch)
  auth.setSession(data.value ?? null)
})
