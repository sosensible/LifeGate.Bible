<template>
  <UInputNumber
    :model-value="model / 100"
    :increment="false"
    :decrement="false"
    :step="0.01"
    :format-options="{ style: 'currency', currency: 'USD' }"
    :size="size"
    :aria-label="ariaLabel"
    :ui="{ base: 'text-right tabular-nums' }"
    @update:model-value="update"
  />
</template>

<script setup lang="ts">
// Nuxt UI's currency input, with integer cents in the model (the way amounts
// are stored). Emits `change` when the amount actually changes.
const model = defineModel<number>({ required: true })
withDefaults(defineProps<{ size?: 'xs' | 'sm' | 'md', ariaLabel?: string }>(), { size: 'md', ariaLabel: undefined })
const emit = defineEmits<{ change: [cents: number] }>()

const update = (dollars: number | null | undefined) => {
  const cents = Math.round((dollars ?? 0) * 100)
  if (cents === model.value) return
  model.value = cents
  emit('change', cents)
}
</script>
