<template>
  <div class="flex items-center gap-4">
    <img v-if="url" :src="url" alt="Current photo" class="w-24 h-24 object-cover border border-default shrink-0" :class="round ? 'rounded-full' : 'rounded-lg'">
    <div v-else class="w-24 h-24 bg-muted border border-dashed border-default flex items-center justify-center shrink-0" :class="round ? 'rounded-full' : 'rounded-lg'">
      <UIcon name="i-lucide-image" class="w-7 h-7 text-dimmed" />
    </div>
    <div class="space-y-2">
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-upload" :loading="uploading" :disabled="removing" @click="input?.click()">
          {{ url ? 'Replace photo' : 'Upload photo' }}
        </UButton>
        <UButton v-if="url" size="sm" variant="ghost" color="neutral" icon="i-lucide-trash-2" :loading="removing" :disabled="uploading" @click="remove">Remove</UButton>
      </div>
      <p class="text-muted text-xs">Any photo. It is made smaller and stripped of location details before it is uploaded.</p>
    </div>
    <input ref="input" type="file" accept="image/*" class="hidden" @change="upload">
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ endpoint: string, round?: boolean }>()
const url = defineModel<string | null>('url', { required: true })
const emit = defineEmits<{ changed: [url: string | null] }>()

const toast = useToast()
const input = ref<HTMLInputElement>()
const uploading = ref(false)
const removing = ref(false)

// The longest side after shrinking. Plenty for a face or a family, and small enough
// that a phone's 5 MB original is never refused.
const MAX_SIDE = 1200

// Draws the photo onto a canvas and sends that. This does three things a plain
// upload does not: it turns the photo the right way up (phones store "rotate me"
// in hidden data), it drops every hidden detail including where it was taken, and
// it makes it small. If the browser cannot read the file, nothing is sent: better
// to refuse than to upload something with its location still inside.
const prepare = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no canvas')
  // A transparent PNG would turn black as a JPEG.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('no image')), 'image/jpeg', 0.88))
}

const upload = async () => {
  const file = input.value?.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    let blob: Blob
    try {
      blob = await prepare(file)
    }
    catch {
      toast.add({ title: 'Photo not uploaded', description: 'This browser could not read that picture. Try a JPEG or PNG.', color: 'error', icon: 'i-lucide-circle-alert' })
      return
    }
    const body = new FormData()
    body.append('photo', blob, 'photo.jpg')
    const result = await $fetch<{ photoUrl: string }>(props.endpoint, { method: 'PUT', body })
    url.value = result.photoUrl
    emit('changed', result.photoUrl)
    toast.add({ title: 'Photo saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (error) {
    toast.add({ title: 'Photo not uploaded', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    uploading.value = false
    if (input.value) input.value.value = ''
  }
}

const remove = async () => {
  removing.value = true
  try {
    await $fetch(props.endpoint, { method: 'DELETE' })
    url.value = null
    emit('changed', null)
    toast.add({ title: 'Photo removed', color: 'success' })
  }
  catch (error) {
    toast.add({ title: 'Photo not removed', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    removing.value = false
  }
}
</script>
