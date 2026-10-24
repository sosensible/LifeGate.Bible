<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <NuxtLink to="/directory" class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4 inline-flex items-center gap-1.5 hover:underline">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          Directory
        </NuxtLink>
        <div class="flex items-center gap-5">
          <img v-if="page.photoUrl" :src="page.photoUrl" :alt="fullName(page)" class="w-20 h-20 rounded-full object-cover shrink-0 border-2 border-gold-400">
          <div v-else class="w-20 h-20 rounded-full flex items-center justify-center shrink-0 text-white text-2xl font-bold" :style="{ backgroundColor: avatarColor(page.id) }">{{ initialsOf(page) }}</div>
          <div class="min-w-0">
            <h1 class="text-4xl font-bold font-serif text-white leading-tight">{{ fullName(page) }}</h1>
            <p v-if="page.title" class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mt-1.5">{{ page.title }}</p>
            <div class="flex flex-wrap gap-1.5 mt-3">
              <UBadge v-if="page.isSelf" color="secondary" variant="solid" size="sm">This is you</UBadge>
              <UBadge v-if="page.isSpeaker" color="neutral" variant="subtle" size="sm" icon="i-lucide-mic">Speaker</UBadge>
              <UBadge v-if="page.kind === 'guest'" color="neutral" variant="subtle" size="sm">Guest</UBadge>
              <UBadge v-if="page.isMinor" color="neutral" variant="subtle" size="sm">Child</UBadge>
            </div>
            <p v-if="page.isSelf && page.photoUrl && page.sharing && !page.sharing.photo" class="text-xs text-white/80 mt-3">
              Only you and the church office can see this photo yet.
              <NuxtLink to="/profile" class="text-gold-400 hover:underline">Choose whether to share it</NuxtLink>
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-12">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <!-- What this person has chosen to share -->
          <UCard class="lg:col-span-1" :ui="{ header: 'p-4 sm:p-5', body: 'p-4 sm:p-5' }">
            <template #header>
              <h2 class="font-serif font-bold text-lg text-highlighted">About</h2>
            </template>
            <ul v-if="details.length" class="space-y-3 text-sm text-toned">
              <li v-for="detail in details" :key="detail.key" class="flex items-start gap-2.5">
                <UIcon :name="detail.icon" class="size-4 text-gold-600 shrink-0 mt-0.5" />
                <div class="min-w-0">
                  <img v-if="detail.key === 'household' && page.householdPhotoUrl" :src="page.householdPhotoUrl" :alt="`${detail.value}`" class="w-full max-w-xs rounded-lg border border-default mb-2 object-cover">
                  <a v-if="detail.href" :href="detail.href" class="hover:underline break-all">{{ detail.value }}</a>
                  <span v-else>{{ detail.value }}</span>
                  <p v-if="detail.onlyYou" class="text-xs text-muted mt-0.5">Only you can see this</p>
                </div>
              </li>
            </ul>
            <p v-else class="text-sm text-muted">
              {{ page.isSelf ? 'You have not added any details yet.' : `${page.firstName} has not shared any contact details.` }}
            </p>
            <p v-if="page.isSelf" class="text-xs text-muted mt-4">
              The lines marked “Only you can see this” are not shared with other members.
              <NuxtLink to="/profile" class="text-primary hover:underline">Change what is shared</NuxtLink>
            </p>
          </UCard>

          <div class="lg:col-span-2 space-y-10">
            <!-- Ministries -->
            <section v-if="page.ministries.length">
              <h2 class="text-2xl font-bold font-serif text-highlighted mb-4">Serves in</h2>
              <ul class="flex flex-wrap gap-3">
                <li v-for="ministry in page.ministries" :key="ministry.slug">
                  <UButton :to="`/ministries/${ministry.slug}`" color="neutral" variant="outline" icon="i-lucide-hand-heart">
                    {{ ministry.name }}<template v-if="ministry.isLeader"> · Leader</template>
                  </UButton>
                </li>
              </ul>
            </section>

            <!-- Messages, for a speaker -->
            <section v-if="page.isSpeaker || page.messages.length">
              <h2 class="text-2xl font-bold font-serif text-highlighted mb-4">
                Messages
                <span v-if="page.messages.length" class="text-muted text-base font-sans font-normal">({{ page.messages.length }})</span>
              </h2>
              <UEmpty v-if="!page.messages.length" icon="i-lucide-mic" title="No messages yet" :description="`${page.firstName} has no published messages to show.`" />
              <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
                <ul class="divide-y divide-default">
                  <li v-for="message in page.messages" :key="message.id" class="px-4 sm:px-5 py-3">
                    <NuxtLink :to="`/teaching/${message.slug}`" class="font-semibold text-highlighted hover:underline leading-snug">{{ message.title }}</NuxtLink>
                    <p class="text-xs text-muted mt-0.5">
                      {{ [formatSermonDate(message.preachedOn), message.series?.name, message.scripture].filter(Boolean).join(' · ') }}
                    </p>
                  </li>
                </ul>
              </UCard>
            </section>

            <p v-if="!page.ministries.length && !page.isSpeaker && !page.messages.length" class="text-sm text-muted">
              {{ page.isSelf ? 'You are not listed in any ministry yet.' : `${page.firstName} is not listed in any ministry.` }}
            </p>
          </div>
        </div>

        <!-- Only for the person themselves. -->
        <PeopleOwnerSections v-if="page.isSelf" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PersonPageView } from '#shared/person-page'

// Members only. The server answers 404 for anyone the viewer may not see, a minor
// included, so this page never confirms who exists.
definePageMeta({ middleware: 'auth', layout: 'default' })

const route = useRoute()
const { data, error } = await useFetch<PersonPageView>(() => `/api/people/${encodeURIComponent(String(route.params.id))}`)

if (error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: 'Person not found', fatal: true })
}
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: 'Could not load this page', fatal: true })
}

const page = computed(() => data.value!)

useSeoMeta({ title: () => `${page.value ? fullName(page.value) : 'Member'}` })

// Each detail the viewer may see. On your own page, the ones others cannot see are
// marked, so you know what you are and are not sharing.
const details = computed(() => {
  const p = page.value
  const sharing = p.sharing
  return [
    p.phone && { key: 'phone', icon: 'i-lucide-phone', value: p.phone, href: `tel:${p.phone}`, onlyYou: sharing ? !sharing.phone : false },
    p.email && { key: 'email', icon: 'i-lucide-mail', value: p.email, href: `mailto:${p.email}`, onlyYou: sharing ? !sharing.email : false },
    p.address && { key: 'address', icon: 'i-lucide-map-pin', value: p.address, href: undefined, onlyYou: sharing ? !sharing.address : false },
    p.birthday && { key: 'birthday', icon: 'i-lucide-cake', value: `Birthday: ${formatBirthday(p.birthday)}`, href: undefined, onlyYou: sharing ? !sharing.birthday : false },
    p.householdName && { key: 'household', icon: 'i-lucide-house', value: p.householdName, href: undefined, onlyYou: sharing ? !sharing.household : false },
  ].filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))
})
</script>
