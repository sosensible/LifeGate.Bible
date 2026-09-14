<template>
  <div class="flex items-center gap-4">
    <!-- The photo is always shown before it is saved, so nobody saves one they have not seen. -->
    <img v-if="previewUrl" :src="previewUrl" alt="Photo preview" class="w-24 h-24 rounded-lg object-cover border border-default shrink-0">
    <div v-else class="w-24 h-24 rounded-lg bg-muted border border-dashed border-default flex items-center justify-center shrink-0">
      <UIcon name="i-lucide-image" class="w-7 h-7 text-dimmed" />
    </div>
    <div class="space-y-2">
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-upload" :loading="uploading" @click="input?.click()">
          {{ photo ? 'Replace photo' : 'Upload photo' }}
        </UButton>
        <UButton v-if="photo" size="sm" variant="ghost" color="neutral" icon="i-lucide-x" @click="clear">Remove</UButton>
      </div>
      <p class="text-muted text-xs">JPEG, PNG or WebP, up to 5 MB.</p>
    </div>
    <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="upload">
  </div>
</template>

<script setup lang="ts">
const photo = defineModel<string | null>('photo', { required: true })
const previewUrl = defineModel<string | null>('previewUrl', { required: true })

const toast = useToast()
const input = ref<HTMLInputElement>()
const uploading = ref(false)

const upload = async () => {
  const file = input.value?.files?.[0]
  if (!file) return
  const body = new FormData()
  body.append('photo', file)
  uploading.value = true
  try {
    const result = await $fetch('/api/missions/photos', { method: 'POST', body })
    photo.value = result.photo
    previewUrl.value = result.photoUrl
  }
  catch (error) {
    toast.add({ title: 'Photo not uploaded', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    uploading.value = false
    if (input.value) input.value.value = ''
  }
}

const clear = () => {
  photo.value = null
  previewUrl.value = null
}
</script>
