<template>
  <div v-if="missionary">
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <NuxtLink to="/missions" class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2 inline-flex items-center gap-1.5 hover:underline">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          All Missions
        </NuxtLink>
        <div class="flex flex-wrap items-end justify-between gap-4 mt-2">
          <div>
            <h1 class="text-4xl font-bold font-serif text-white">{{ missionary.name }}</h1>
            <p v-if="missionary.familyNames" class="text-white/70 mt-1">{{ missionary.familyNames }}</p>
          </div>
          <UButton v-if="canEdit" icon="i-lucide-pencil" color="secondary" @click="editing = true">Edit</UButton>
        </div>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-10">
        <!-- Main -->
        <div class="lg:col-span-2 space-y-10">
          <img v-if="missionary.photoUrl" :src="missionary.photoUrl" :alt="missionary.name" class="w-full max-h-[28rem] object-cover rounded-lg border border-default">
          <p v-if="missionary.writeup" class="text-toned leading-relaxed whitespace-pre-line">{{ missionary.writeup }}</p>

          <!-- Prayer requests and letters -->
          <section>
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 class="text-2xl font-bold font-serif text-highlighted">Prayer &amp; Updates</h2>
              <div v-if="canEdit" class="flex gap-2">
                <UButton size="sm" variant="outline" icon="i-lucide-hand-heart" @click="startUpdate('prayer')">Prayer request</UButton>
                <UButton size="sm" variant="outline" icon="i-lucide-mail-open" @click="startUpdate('letter')">Prayer letter</UButton>
              </div>
            </div>
            <p v-if="!missionary.updates.length" class="text-muted text-sm">No prayer requests or letters yet.</p>
            <ul v-else class="space-y-4">
              <li v-for="update in missionary.updates" :key="update.id" class="bg-elevated border border-default rounded-lg p-5">
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">{{ update.kind === 'prayer' ? 'Prayer request' : 'Prayer letter' }} · {{ formatSermonDate(update.postedOn) }}</p>
                    <h3 v-if="update.title" class="font-serif font-bold text-highlighted">{{ update.title }}</h3>
                  </div>
                  <UButton v-if="canEdit" size="xs" variant="ghost" color="neutral" icon="i-lucide-trash-2" aria-label="Remove update" @click="removingUpdate = update" />
                </div>
                <p v-if="update.body" class="text-toned text-sm leading-relaxed whitespace-pre-line">{{ update.body }}</p>
                <UButton v-if="update.url" :to="update.url" target="_blank" rel="noopener noreferrer" variant="link" icon="i-lucide-external-link" class="px-0 mt-1">
                  {{ update.kind === 'letter' ? 'Read the letter' : 'Open link' }}
                </UButton>
              </li>
            </ul>
          </section>
        </div>

        <!-- Sidebar -->
        <aside class="space-y-6">
          <div class="bg-muted border border-default rounded-lg p-5 space-y-3 text-sm">
            <div>
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Status</p>
              <p class="text-highlighted">{{ MISSIONARY_STATUS_LABELS[missionary.status] }}</p>
            </div>
            <div v-if="missionary.field">
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Field</p>
              <p class="text-highlighted">{{ missionary.field }}</p>
            </div>
            <div v-if="missionary.focus">
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Focus</p>
              <p class="text-highlighted">{{ missionary.focus }}</p>
            </div>
            <div v-if="missionary.organization">
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Organization</p>
              <NuxtLink :to="`/missions/organizations/${missionary.organization.slug}`" class="text-primary hover:underline">{{ missionary.organization.name }}</NuxtLink>
            </div>
            <div v-if="missionary.startedYear">
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Serving since</p>
              <p class="text-highlighted">{{ missionary.startedYear }}</p>
            </div>
            <UButton v-if="missionary.supportUrl" :to="missionary.supportUrl" target="_blank" rel="noopener noreferrer" color="secondary" icon="i-lucide-heart-handshake" block class="mt-2">
              Support this ministry
            </UButton>
          </div>

          <div v-if="missionary.nextVisitOn" class="bg-parchment-900 rounded-lg p-5 text-sm">
            <p class="text-gold-400 text-[10px] tracking-[0.15em] uppercase mb-1">Next visit to Lifegate</p>
            <p class="text-white font-serif text-lg">{{ formatSermonDate(missionary.nextVisitOn) }}</p>
            <p v-if="missionary.nextVisitNote" class="text-white/70">{{ missionary.nextVisitNote }}</p>
          </div>

          <div v-if="hasContact" class="bg-elevated border border-default rounded-lg p-5 space-y-2.5 text-sm text-toned">
            <div class="flex items-center justify-between gap-2">
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Contact</p>
              <UBadge v-if="canEdit && !missionary.shareContact" color="neutral" variant="subtle" size="sm" icon="i-lucide-eye-off">Not shown to members</UBadge>
            </div>
            <div v-if="missionary.email" class="flex gap-2.5 items-center">
              <UIcon name="i-lucide-mail" class="w-4 h-4 text-gold-600 shrink-0" />
              <a :href="`mailto:${missionary.email}`" class="hover:underline break-all">{{ missionary.email }}</a>
            </div>
            <div v-if="missionary.phone" class="flex gap-2.5 items-center">
              <UIcon name="i-lucide-phone" class="w-4 h-4 text-gold-600 shrink-0" />
              <a :href="`tel:${missionary.phone}`" class="hover:underline">{{ missionary.phone }}</a>
            </div>
            <div v-if="missionary.website" class="flex gap-2.5 items-center">
              <UIcon name="i-lucide-globe" class="w-4 h-4 text-gold-600 shrink-0" />
              <a :href="missionary.website" target="_blank" rel="noopener noreferrer" class="hover:underline break-all">{{ missionary.website }}</a>
            </div>
            <div v-if="missionary.mailingAddress" class="flex gap-2.5 items-start">
              <UIcon name="i-lucide-map-pin" class="w-4 h-4 text-gold-600 shrink-0 mt-0.5" />
              <span class="whitespace-pre-line">{{ missionary.mailingAddress }}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <template v-if="canEdit">
      <MissionsMissionarySlideover v-model:open="editing" :missionary="missionary" :organizations="organizations" @saved="refresh()" @removed="navigateTo('/missions')" />

      <UModal v-model:open="addingUpdate" :title="updateState.kind === 'prayer' ? 'Add a prayer request' : 'Add a prayer letter'">
        <template #body>
          <UForm id="update-form" :schema="missionUpdateSchema" :state="updateState" class="space-y-4" @submit="saveUpdate">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField label="Date" name="postedOn" required>
                <UInput v-model="updateState.postedOn" type="date" class="w-full" />
              </UFormField>
              <UFormField label="Title" name="title">
                <UInput v-model="updateState.title" class="w-full" />
              </UFormField>
            </div>
            <UFormField :label="updateState.kind === 'prayer' ? 'Request' : 'Letter'" name="body">
              <UTextarea v-model="updateState.body" :rows="6" autoresize class="w-full" />
            </UFormField>
            <UFormField label="Link" name="url" :description="updateState.kind === 'letter' ? 'If the letter is posted online, such as a PDF on their website.' : undefined">
              <UInput v-model="updateState.url" type="url" placeholder="https://" class="w-full" />
            </UFormField>
          </UForm>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="outline" @click="addingUpdate = false">Cancel</UButton>
            <UButton type="submit" form="update-form" :loading="savingUpdate">Add</UButton>
          </div>
        </template>
      </UModal>

      <UModal :open="Boolean(removingUpdate)" title="Remove this update?" description="It will no longer appear on this page." @update:open="value => { if (!value) removingUpdate = null }">
        <template #footer>
          <UButton color="neutral" variant="outline" @click="removingUpdate = null">Keep</UButton>
          <UButton color="error" :loading="deletingUpdate" @click="removeUpdate">Remove</UButton>
        </template>
      </UModal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { MISSIONARY_STATUS_LABELS, missionUpdateSchema, type MissionUpdateView } from '#shared/missions'

definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

const route = useRoute()
const toast = useToast()
const { data, error, refresh } = await useFetch(() => `/api/missions/missionaries/${encodeURIComponent(String(route.params.slug))}`)

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 500,
    statusMessage: error.value.statusCode === 404 ? 'Missionary not found' : 'Could not load this missionary',
    fatal: true,
  })
}

const missionary = computed(() => data.value?.missionary)
const canEdit = computed(() => Boolean(data.value?.canEdit))
useSeoMeta({ title: () => `${missionary.value?.name ?? 'Missions'} | Lifegate Baptist Church`, robots: 'noindex, nofollow' })

const hasContact = computed(() => Boolean(missionary.value?.email || missionary.value?.phone || missionary.value?.website || missionary.value?.mailingAddress))

// Organizations for the edit form, fetched when an editor opens it.
const organizations = ref<Array<{ id: string, name: string }>>([])
const editing = ref(false)
watch(editing, async (open) => {
  if (open) organizations.value = (await $fetch('/api/missions')).organizations
})

const today = () => new Date().toLocaleDateString('en-CA')
const addingUpdate = ref(false)
const updateState = reactive({ kind: 'prayer' as 'prayer' | 'letter', postedOn: today(), title: '', body: '', url: '' })
const startUpdate = (kind: 'prayer' | 'letter') => {
  Object.assign(updateState, { kind, postedOn: today(), title: '', body: '', url: '' })
  addingUpdate.value = true
}

const savingUpdate = ref(false)
const saveUpdate = async () => {
  if (!missionary.value) return
  savingUpdate.value = true
  try {
    await $fetch(`/api/missions/missionaries/${missionary.value.id}/updates`, { method: 'POST', body: updateState })
    await refresh()
    toast.add({ title: updateState.kind === 'prayer' ? 'Prayer request added' : 'Prayer letter added', color: 'success', icon: 'i-lucide-circle-check' })
    addingUpdate.value = false
  }
  catch (error) {
    toast.add({ title: 'Not added', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    savingUpdate.value = false
  }
}

const removingUpdate = ref<MissionUpdateView | null>(null)
const deletingUpdate = ref(false)
const removeUpdate = async () => {
  if (!removingUpdate.value) return
  deletingUpdate.value = true
  try {
    await $fetch(`/api/missions/updates/${removingUpdate.value.id}`, { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Update removed', color: 'success' })
    removingUpdate.value = null
  }
  catch (error) {
    toast.add({ title: 'Not removed', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    deletingUpdate.value = false
  }
}
</script>
