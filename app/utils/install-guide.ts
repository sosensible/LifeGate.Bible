// Helps a person put the site on their device. The dialog itself (the steps for
// iPhone and iPad, Android, desktop Chrome/Edge and Safari) is the
// @khmyznikov/pwa-install web component; this is the small amount of glue around
// it, kept free of Nuxt so it can be tested.

export interface PwaInstallElement extends HTMLElement {
  showDialog: (force?: boolean) => void
  // The browser's install event, handed over by hand: see below.
  externalPromptEvent?: Event
}

// Whether the site is already running as an installed app, so there is nothing
// to install. `navigator.standalone` is how iPhone says it.
export const isStandalone = (win: { matchMedia?: Window['matchMedia'], navigator?: { standalone?: boolean } }) =>
  Boolean(win.matchMedia?.('(display-mode: standalone)').matches || win.navigator?.standalone)

// Chromium offers the install prompt once per page load, soon after it loads,
// and the dialog is only added to the page a moment later. So the event is
// caught the moment it fires (see app/plugins/install-prompt.client.ts) and kept
// here until the dialog exists, then given to it.
export const createInstallGuide = () => {
  let element: PwaInstallElement | null = null
  let prompt: Event | null = null

  const give = () => {
    if (element && prompt) element.externalPromptEvent = prompt
  }

  return {
    register: (el: PwaInstallElement) => {
      element = el
      give()
    },
    unregister: () => {
      element = null
    },
    capture: (event: Event) => {
      prompt = event
      give()
    },
    // Opens the dialog, whatever the device: it shows the install button where the
    // browser has one, and the steps where it has not. False if it is not there yet.
    open: () => {
      if (!element) return false
      element.showDialog(true)
      return true
    },
  }
}

export const installGuide = createInstallGuide()
