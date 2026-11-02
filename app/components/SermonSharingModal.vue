<template>
  <UModal
    :open="open"
    :title="sermon ? `Sharing: ${sermon.title}` : 'Sharing'"
    description="Each of these controls is separate, and each one can stop a message from being shared."
    @update:open="value => emit('update:open', value)"
  >
    <template #body>
      <SermonSharing
        v-if="sermon"
        :sermon-id="sermon.id"
        :sharing="sermon.sharing"
        :visibility="sermon.visibility"
        :can-teach="canTeach"
        :hold-parties="holdParties"
        @changed="saved => emit('changed', saved)"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { AdminSermonView } from '#shared/sermons'
import { HOLD_PARTIES } from '#shared/sermon-sharing'

defineProps<{
  open: boolean
  sermon: AdminSermonView | null
  // The signed-in person taught this message.
  canTeach?: boolean
}>()
const emit = defineEmits<{ 'update:open': [boolean], 'changed': [AdminSermonView] }>()

// Which pauses this person holds the right to place and lift.
const auth = useAuthStore()
const holdParties = computed(() => HOLD_PARTIES.filter(party => auth.can({ sermonHold: [party] })))
</script>
