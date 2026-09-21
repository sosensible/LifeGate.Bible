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

    // Nuxt UI draws a `soft`/`subtle` surface from a single token: the tint is
    // that colour at 10% and the words are the same colour at full strength.
    // For warning that colour is amber-500, which measures 1.8:1 against its
    // own tint — far under the 4.5:1 minimum, and the reason the "not in the
    // directory" notice was hard to read. Darkening the words to amber-800
    // takes it to 6.4:1 and leaves the amber tint alone, so the block still
    // reads as a caution rather than turning grey.
    alert: {
      compoundVariants: [
        { color: 'warning', variant: 'soft', class: { root: 'text-warning-800' } },
        { color: 'warning', variant: 'subtle', class: { root: 'text-warning-800' } },
      ],
    },
    badge: {
      compoundVariants: [
        { color: 'warning', variant: 'soft', class: 'text-warning-800' },
        { color: 'warning', variant: 'subtle', class: 'text-warning-800' },
      ],
    },
    // The tab that is not open is drawn in `text-muted`, which measures 3.24:1
    // on the tab strip — readable, but under the 4.5:1 minimum. One shade
    // darker settles it at 4.9:1 and still leaves the open tab standing out.
    tabs: {
      slots: {
        trigger: 'data-[state=inactive]:text-toned',
      },
    },
    // The same amber on the buttons inside those blocks, such as the
    // "Show only these" action. `solid` is left alone: it paints white on solid
    // amber, which is a different sum and is not used in a warning block.
    button: {
      compoundVariants: (['outline', 'soft', 'subtle', 'ghost', 'link'] as const).map(variant => ({
        color: 'warning' as const,
        variant,
        class: 'text-warning-800',
      })),
    },
  },
})
