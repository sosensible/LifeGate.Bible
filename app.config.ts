export default defineAppConfig({
  ui: {
    // Semantic color aliases (@nuxt/ui v4). These map to Tailwind palettes for now;
    // the next Phase 1a step swaps them to custom brand ramps (green / burgundy / gold)
    // defined in app/assets/css/main.css.
    colors: {
      primary: 'green',
      neutral: 'stone',
    },
  },
})
