// The release this site is, shown only to an Admin. It is asked for after sign-in, from an
// Admin-only route, and is never in the page as first sent to a visitor.
export const useAppVersion = () => {
  const auth = useAuthStore()
  const version = useState<string | null>('app-version', () => null)
  if (import.meta.client) {
    watch(() => auth.can({ integrations: ['manage'] }), async (isAdmin) => {
      if (!isAdmin) {
        version.value = null
        return
      }
      if (version.value) return
      try {
        version.value = (await $fetch<{ version: string }>('/api/admin/version')).version
      }
      catch {
        version.value = null
      }
    }, { immediate: true })
  }
  return version
}
