<template>
  <div>
    <div class="bg-[#294231] py-10 px-6">
      <div class="max-w-5xl mx-auto flex items-center justify-between">
        <div>
          <p class="text-[#C4993C] text-xs font-bold tracking-widest uppercase mb-2">Members Area</p>
          <h1 class="text-4xl font-bold font-serif text-white">Sermons</h1>
        </div>
        <UButton @click="showUploadForm = true" color="primary" size="md">+ Upload Sermon</UButton>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6">
      <!-- Upload Form -->
      <div v-if="showUploadForm" class="mb-12 bg-white rounded shadow p-8">
        <h3 class="text-2xl font-bold font-serif text-[#2A1A0E] mb-6">Upload New Sermon</h3>
        <form @submit.prevent="handleUpload" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-bold text-[#5C4230] mb-2">Title *</label>
              <input v-model="uploadForm.title" type="text" required class="w-full px-4 py-2 border border-[#C8B89A] rounded text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-[#5C4230] mb-2">Series</label>
              <input v-model="uploadForm.series" type="text" class="w-full px-4 py-2 border border-[#C8B89A] rounded text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-[#5C4230] mb-2">Date *</label>
              <input v-model="uploadForm.date" type="date" required class="w-full px-4 py-2 border border-[#C8B89A] rounded text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-[#5C4230] mb-2">Pastor</label>
              <input v-model="uploadForm.pastor" type="text" class="w-full px-4 py-2 border border-[#C8B89A] rounded text-sm" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-bold text-[#5C4230] mb-2">Description</label>
            <textarea v-model="uploadForm.description" rows="3" class="w-full px-4 py-2 border border-[#C8B89A] rounded text-sm"></textarea>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-bold text-[#5C4230] mb-2">Video</label>
              <input type="file" accept="video/*" @change="(e) => uploadForm.video = e.target.files?.[0]" class="w-full text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-[#5C4230] mb-2">Audio</label>
              <input type="file" accept="audio/*" @change="(e) => uploadForm.audio = e.target.files?.[0]" class="w-full text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-[#5C4230] mb-2">PDF Notes</label>
              <input type="file" accept="application/pdf" @change="(e) => uploadForm.pdf = e.target.files?.[0]" class="w-full text-sm" />
            </div>
          </div>

          <div v-if="uploadError" class="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {{ uploadError }}
          </div>

          <div class="flex gap-3">
            <UButton type="submit" :loading="uploading" color="primary">Upload Sermon</UButton>
            <UButton type="button" @click="showUploadForm = false" variant="outline" color="neutral">Cancel</UButton>
          </div>
        </form>
      </div>

      <!-- Sermons List -->
      <h2 class="text-3xl font-bold font-serif text-[#2A1A0E] mb-8">Recent Sermons</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="sermon in sermons" :key="sermon.id" class="bg-white rounded shadow overflow-hidden">
          <div class="h-32 bg-gradient-to-br from-[#1A5C30] to-[#0d3a1d] flex items-center justify-center">
            <span class="text-white text-4xl">🎙️</span>
          </div>
          <div class="p-5">
            <p class="text-[#C4993C] text-xs font-bold tracking-widest uppercase mb-1">{{ sermon.series }}</p>
            <h3 class="text-lg font-bold font-serif text-[#2A1A0E] mb-2">{{ sermon.title }}</h3>
            <p class="text-sm text-[#8C7050] mb-4">{{ sermon.date }} · {{ sermon.pastor }}</p>
            <div class="flex gap-2 flex-wrap">
              <UButton v-if="sermon.video_url" variant="ghost" color="primary" size="sm">▶ Watch</UButton>
              <UButton v-if="sermon.audio_url" variant="ghost" color="primary" size="sm">🎧 Audio</UButton>
              <UButton v-if="sermon.pdf_url" variant="ghost" color="primary" size="sm">📄 Notes</UButton>
            </div>
          </div>
        </div>
      </div>

      <div v-if="sermons.length === 0" class="text-center py-12">
        <p class="text-[#8C7050]">No sermons yet</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

const showUploadForm = ref(false)
const uploading = ref(false)
const uploadError = ref('')
const sermons = ref<any[]>([])

const uploadForm = reactive({
  title: '',
  series: '',
  date: '',
  pastor: '',
  description: '',
  video: null as File | null,
  audio: null as File | null,
  pdf: null as File | null,
})

const fetchSermons = async () => {
  try {
    const { data } = await useFetch('/api/sermons')
    sermons.value = data.value?.sermons || []
  }
  catch (err) {
    console.error('Failed to fetch sermons', err)
  }
}

const handleUpload = async () => {
  uploadError.value = ''
  uploading.value = true

  try {
    const formData = new FormData()
    formData.append('title', uploadForm.title)
    formData.append('series', uploadForm.series)
    formData.append('date', uploadForm.date)
    formData.append('pastor', uploadForm.pastor)
    formData.append('description', uploadForm.description)
    if (uploadForm.video) formData.append('video', uploadForm.video)
    if (uploadForm.audio) formData.append('audio', uploadForm.audio)
    if (uploadForm.pdf) formData.append('pdf', uploadForm.pdf)

    const response = await $fetch('/api/sermons/upload', {
      method: 'POST',
      body: formData,
    })

    if (response.success) {
      uploadForm.title = ''
      uploadForm.series = ''
      uploadForm.date = ''
      uploadForm.pastor = ''
      uploadForm.description = ''
      uploadForm.video = null
      uploadForm.audio = null
      uploadForm.pdf = null
      showUploadForm.value = false
      await fetchSermons()
    }
  }
  catch (err: any) {
    uploadError.value = err.message || 'Upload failed'
  }
  finally {
    uploading.value = false
  }
}

onMounted(() => {
  fetchSermons()
})
</script>
