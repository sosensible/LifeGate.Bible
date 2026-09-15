<template>
  <USlideover v-model:open="open" title="Edit your message" :description="sermon?.title" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div v-if="sermon" class="space-y-8">
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          title="Kept by the church office"
          :description="`Speaker: ${sermon.speaker} · Video: ${sermon.videoId ? 'posted' : 'not posted yet'} · ${sermon.visibility === 'public' ? 'Everyone' : 'Members only'} · ${sermon.status === 'published' ? 'Published' : 'Draft'}. Ask them to change these.`"
        />

        <UForm id="teaching-form" :schema="teacherSermonSchema" :state="state" class="space-y-4" @submit="save">
          <UFormField label="Title" name="title" required>
            <UInput v-model="state.title" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Date taught" name="preachedOn" required>
              <UInput v-model="state.preachedOn" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Series" name="seriesId">
              <USelectMenu v-model="state.seriesId" :items="series" value-key="id" label-key="name" placeholder="None" clear class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Passage" name="scripture" hint="e.g. John 10:1–18">
            <UInput v-model="state.scripture" class="w-full" />
          </UFormField>
          <UFormField label="Books of the Bible" name="books">
            <USelectMenu v-model="state.books" :items="[...BIBLE_BOOKS]" multiple placeholder="Choose books" class="w-full" />
          </UFormField>
          <UFormField label="Topics" name="tags" description="Press Enter after each topic.">
            <UInputTags v-model="state.tags" placeholder="e.g. Grace" class="w-full" />
          </UFormField>
          <UFormField label="Notes" name="description">
            <UTextarea v-model="state.description" :rows="6" autoresize class="w-full" />
          </UFormField>
        </UForm>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton type="submit" form="teaching-form" :loading="saving">Save</UButton>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
// A teacher editing their own message: details only. The video, speaker, who
// can watch and publishing are kept by the people who manage teaching.
import { BIBLE_BOOKS, type BibleBook } from '#shared/bible'
import { teacherSermonSchema, type AdminSermonView } from '#shared/sermons'

const props = defineProps<{ sermon: AdminSermonView | null, series: Array<{ id: string, name: string }> }>()
const emit = defineEmits<{ saved: [sermon: AdminSermonView] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const state = reactive({
  title: '',
  preachedOn: '',
  seriesId: null as string | null,
  scripture: '',
  books: [] as BibleBook[],
  tags: [] as string[],
  description: '',
})

watch(open, (isOpen) => {
  const s = props.sermon
  if (!isOpen || !s) return
  Object.assign(state, {
    title: s.title, preachedOn: s.preachedOn, seriesId: s.series?.id ?? null, scripture: s.scripture ?? '',
    books: [...s.books] as BibleBook[], tags: [...s.tags], description: s.description ?? '',
  })
}, { immediate: true })

const saving = ref(false)
const save = async () => {
  if (!props.sermon) return
  saving.value = true
  try {
    const { sermon } = await $fetch(`/api/teaching/mine/${props.sermon.id}`, { method: 'PATCH', body: { ...state } })
    emit('saved', sermon)
    toast.add({ title: 'Changes saved', color: 'success', icon: 'i-lucide-circle-check' })
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = false
  }
}
</script>
