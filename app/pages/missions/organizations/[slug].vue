<template>
  <div v-if="organization">
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <NuxtLink to="/missions" class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2 inline-flex items-center gap-1.5 hover:underline">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          All Missions
        </NuxtLink>
        <div class="flex flex-wrap items-end justify-between gap-4 mt-2">
          <div>
            <p class="text-white/60 text-xs uppercase tracking-wide">Mission Organization</p>
            <h1 class="text-4xl font-bold font-serif text-white">{{ organization.name }}</h1>
            <p v-if="organization.relationship" class="text-white/70 mt-1">{{ organization.relationship }}</p>
          </div>
          <UButton v-if="data?.canEdit" icon="i-lucide-pencil" color="secondary" @click="editing = true">Edit</UButton>
        </div>
      </div>
    </div>

    <!-- Archived: only staff and admins reach this page -->
    <div v-if="organization.archivedAt" class="bg-default px-6 pt-8">
      <UAlert
        class="max-w-6xl mx-auto"
        color="warning"
        variant="subtle"
        icon="i-lucide-archive"
        :title="`Archived ${formatRelative(organization.archivedAt)}`"
        description="Members cannot see this. Restore it, or remove it permanently from the archive on the Missions page."
        :actions="[{ label: 'Restore', icon: 'i-lucide-archive-restore', color: 'neutral', variant: 'outline', loading: restoring, onClick: restore }]"
      />
    </div>

    <div v-if="organization.photoUrl || organization.writeup || organization.website" class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto flex flex-col sm:flex-row gap-8 items-start">
        <img v-if="organization.photoUrl" :src="organization.photoUrl" :alt="organization.name" class="w-40 h-40 rounded-lg object-cover border border-default shrink-0">
        <div class="space-y-4">
          <p v-if="organization.writeup" class="text-toned leading-relaxed whitespace-pre-line max-w-3xl">{{ organization.writeup }}</p>
          <UButton v-if="organization.website" :to="organization.website" target="_blank" rel="noopener noreferrer" variant="outline" icon="i-lucide-external-link">Visit website</UButton>
        </div>
      </div>
    </div>

    <div class="bg-muted border-t border-default py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <h2 class="text-2xl font-bold font-serif text-highlighted mb-6">Missionaries with {{ organization.name }}</h2>
        <p v-if="!data?.missionaries.length" class="text-muted text-sm">None of the missionaries we support serve with this organization yet.</p>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <MissionsMissionaryCard v-for="missionary in data.missionaries" :key="missionary.id" :missionary="missionary" />
        </div>
      </div>
    </div>

    <LazyMissionsOrganizationSlideover v-if="data?.canEdit" v-model:open="editing" :organization="organization" @saved="refresh()" @archived="data?.canDelete ? refresh() : navigateTo('/missions')" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

const route = useRoute()
const toast = useToast()
const { data, error, refresh } = await useFetch(() => `/api/missions/organizations/${encodeURIComponent(String(route.params.slug))}`)

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 500,
    statusMessage: error.value.statusCode === 404 ? 'Organization not found' : 'Could not load this organization',
    fatal: true,
  })
}

const organization = computed(() => data.value?.organization)
// Staff and admins, on an archived entry.
const restoring = ref(false)
const restore = async () => {
  if (!organization.value) return
  restoring.value = true
  try {
    await $fetch(`/api/missions/organizations/${organization.value.id}/restore`, { method: 'POST' })
    await refresh()
    toast.add({ title: `${organization.value?.name} restored`, color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (error) {
    toast.add({ title: 'Not restored', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    restoring.value = false
  }
}

useSeoMeta({ title: () => `${organization.value?.name ?? 'Missions'} | Lifegate Baptist Church`, robots: 'noindex, nofollow' })

const editing = ref(false)
</script>
