// Leaves out the response header that names the framework (`X-Powered-By: Nuxt`). It does the
// site no good and tells a stranger what to look up.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event) => {
    removeResponseHeader(event, 'x-powered-by')
  })
})
