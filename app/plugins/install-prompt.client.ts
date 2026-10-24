// Catches the browser's install event the moment it fires, before the install
// dialog has loaded, and keeps it for the dialog (see app/utils/install-guide.ts).
// Also notes whether the site is already running as an installed app.
export default defineNuxtPlugin((nuxtApp) => {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Held back so the browser's own banner does not appear unasked; the person
    // chooses to install from the Install button. Stopped here so the dialog's own
    // listener does not take it a second time: it is handed over instead.
    event.preventDefault()
    event.stopImmediatePropagation()
    installGuide.capture(event)
  })

  const standalone = useState('install-standalone', () => false)
  window.addEventListener('appinstalled', () => { standalone.value = true })
  // After the page has hydrated, so what the server drew and what is drawn first agree.
  nuxtApp.hook('app:mounted', () => { standalone.value = isStandalone(window) })
})
