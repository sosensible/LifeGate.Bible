export default defineAppConfig({
  ui: {
    // Semantic aliases mapped to the brand ramps in app/assets/css/main.css.
    // `neutral` = warm parchment/brown so Nuxt UI's auto-generated light/dark
    // surfaces + text read warm rather than cool gray.
    colors: {
      primary: 'lifegate',
      secondary: 'burgundy',
      neutral: 'parchment',
    },
  },
})
