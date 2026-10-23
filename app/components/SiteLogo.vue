<template>
  <!-- The church's logo, in the size the screen needs. Made from the one picture
       uploaded on the Church details page, or the built-in mark until then. -->
  <img
    :src="logoSrc(432)"
    :srcset="srcset"
    :sizes="sizes"
    :width="site.logoWidth"
    :height="site.logoHeight"
    :alt="alt || site.name"
    decoding="async"
    v-bind="$attrs"
  >
</template>

<script setup lang="ts">
import { LOGO_WIDTHS } from '../../shared/site-logo'

defineOptions({ inheritAttrs: false })

// `sizes` is the logo's rendered width, so the browser picks the smallest file
// that is sharp on the screen, e.g. "72px" for a logo 48px tall.
withDefaults(defineProps<{ sizes?: string, alt?: string }>(), { sizes: '144px', alt: undefined })

const { site, logoSrc } = useSite()
const srcset = computed(() => LOGO_WIDTHS.map(w => `${logoSrc(w)} ${w}w`).join(', '))
</script>
