// Only follow same-site paths from ?redirect=. Anything else ("https://evil",
// "//evil.example") falls back, so the login page cannot be used as an open
// redirect.
export const useSafeRedirect = (fallback = '/members') => {
  const route = useRoute()
  return computed(() => {
    const target = route.query.redirect
    return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
      ? target
      : fallback
  })
}
