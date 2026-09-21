<template>
  <!-- The crest in the size the screen needs: AVIF where supported, PNG otherwise.
       public/logo.png (1536x1024, 1 MB) stays as the source; regenerate these from it if it changes. -->
  <picture>
    <source type="image/avif" :srcset="srcset('avif')" :sizes="sizes">
    <img
      :src="'/images/logo-432.png'"
      :srcset="srcset('png')"
      :sizes="sizes"
      width="1536"
      height="1024"
      decoding="async"
      v-bind="$attrs"
    >
  </picture>
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false })

// `sizes` is the logo's rendered width, so the browser picks the smallest file
// that is sharp on the screen, e.g. "72px" for a logo 48px tall.
withDefaults(defineProps<{ sizes?: string }>(), { sizes: '144px' })

const widths = [216, 432, 864]
const srcset = (format: 'avif' | 'png') => widths.map(w => `/images/logo-${w}.${format} ${w}w`).join(', ')
</script>
