// Which release this site is, for an Admin to check against. Never part of a public page.
export default defineEventHandler(async (event) => {
  await requirePermission(event, { integrations: ['manage'] })
  setHeader(event, 'cache-control', 'no-store')
  return { version: useRuntimeConfig(event).appVersion }
})
