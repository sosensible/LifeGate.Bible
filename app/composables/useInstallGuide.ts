// The Install the app buttons: open the install dialog, and hide when the site is
// already running as an installed app.
export const useInstallGuide = () => ({
  open: () => installGuide.open(),
  standalone: useState('install-standalone', () => false),
})
