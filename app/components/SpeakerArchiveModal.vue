<template>
  <UModal
    v-model:open="open"
    title="Archive this speaker?"
    :description="speaker ? `${fullName(speaker)} will be taken off the Speakers list. Staff and administrators can restore them or remove them permanently.` : ''"
  >
    <template #footer>
      <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
      <UButton icon="i-lucide-archive" :loading="archiving" @click="archive">Archive</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ speaker: { id: string, firstName: string, lastName: string } | null }>()
const emit = defineEmits<{ archived: [] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const archiving = ref(false)
const archive = async () => {
  if (!props.speaker) return
  archiving.value = true
  try {
    await $fetch(`/api/speakers/${props.speaker.id}/archive`, { method: 'POST' })
    toast.add({ title: `${fullName(props.speaker)} archived`, color: 'success', icon: 'i-lucide-archive' })
    open.value = false
    emit('archived')
  }
  catch (error) {
    toast.add({ title: 'Not archived', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    archiving.value = false
  }
}
</script>
