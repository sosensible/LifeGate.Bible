<template>
  <div>
    <!-- Hero -->
    <section class="bg-muted py-24 px-6">
      <div class="max-w-5xl mx-auto">
        <p v-if="placeName" class="text-primary text-xs font-bold tracking-[0.2em] uppercase mb-4">{{ placeName }}</p>
        <h1 class="text-5xl sm:text-6xl md:text-7xl font-bold font-serif text-highlighted leading-[1.05] mb-6">
          Where Life<br>Meets <span class="text-secondary italic">the Word.</span>
        </h1>
        <div class="flex items-center gap-4 mb-6">
          <div class="h-0.5 w-12 bg-gold-500 shrink-0"></div>
          <span class="text-toned text-sm italic">"I am the way, the truth, and the life." — John 14:6</span>
        </div>
        <p class="text-lg text-toned leading-relaxed max-w-xl mb-9">
          A Baptist church family<template v-if="placeName"> in {{ placeName }}</template> — gathering in faith, friendship, and the love of Scripture.
        </p>
        <div class="flex gap-4 flex-wrap">
          <UButton color="primary" size="xl" class="uppercase tracking-wide font-bold">Plan Your Visit</UButton>
          <UButton to="/login" color="secondary" variant="outline" size="xl" class="uppercase tracking-wide font-bold">Member Login</UButton>
        </div>
      </div>
    </section>

    <!-- Service times -->
    <section v-if="shown.length" class="bg-secondary-900 py-8 px-6">
      <div class="max-w-5xl mx-auto grid grid-cols-1 gap-8 text-center" :class="site.serviceTimes.length <= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'">
        <div v-for="(service, i) in shown" :key="i" :class="i ? 'sm:border-l border-white/15' : ''">
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">{{ service.label }}</p>
          <p class="text-2xl font-bold font-serif text-white mb-1">{{ service.time }}</p>
          <p v-if="service.changed" class="text-gold-400 text-xs font-bold mb-1">{{ service.day }}, {{ service.changed }} (changed)</p>
          <p v-if="service.note" class="text-secondary-200 text-sm">{{ service.note }}</p>
        </div>
      </div>
      <!-- Only while a live meeting is scheduled -->
      <div v-if="join" class="max-w-5xl mx-auto mt-7 flex justify-center">
        <UButton v-bind="join" size="lg" icon="i-lucide-radio" class="bg-gold-500 text-highlighted hover:bg-gold-600 uppercase tracking-wide font-bold">Join Live Meeting</UButton>
      </div>
    </section>

    <!-- About -->
    <section class="bg-default py-20 px-6">
      <div class="max-w-5xl mx-auto flex flex-col md:flex-row gap-16 items-center">
        <div class="flex-1">
          <p class="text-gold-600 text-xs font-bold tracking-[0.2em] uppercase mb-4">Who We Are</p>
          <h2 class="text-4xl font-bold font-serif text-primary leading-tight mb-5">Growing Together<br>in Grace</h2>
          <p class="text-toned leading-relaxed mb-4">
            {{ site.name }} is a family of believers committed to the Word of God. We are a congregation<template v-if="placeName"> in {{ placeName }}</template>, welcoming all who seek His truth and grace.
          </p>
          <p class="text-toned leading-relaxed mb-7">
            Whether you are new to faith or rooted in Scripture, there is a place for you here. We would love to worship alongside you.
          </p>
          <NuxtLink to="/about" class="text-secondary font-bold text-sm border-b-2 border-gold-500 pb-1 inline-block">Learn More About Us →</NuxtLink>
        </div>
        <div class="shrink-0">
          <SiteLogo sizes="288px" alt="" class="w-72 max-w-full" />
        </div>
      </div>
    </section>

    <!-- Connect -->
    <section class="bg-parchment-900 py-20 px-6">
      <div class="max-w-5xl mx-auto flex flex-col md:flex-row gap-16">
        <div class="flex-1">
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Visit Us</p>
          <h2 class="text-4xl font-bold font-serif text-white leading-tight mb-4">We'd Love<br>to Meet You</h2>
          <p class="text-parchment-300 leading-relaxed mb-7 max-w-md">
            Come as you are. Our doors are open to everyone seeking truth, community, and grace. No prerequisites — just come.
          </p>
          <UButton v-if="directionsUrl" :to="directionsUrl" target="_blank" size="lg" class="bg-gold-500 text-highlighted hover:bg-gold-600 uppercase tracking-wide font-bold">Get Directions</UButton>
        </div>
        <div class="flex-1 flex flex-col gap-7">
          <div>
            <p class="text-gold-400 text-xs font-bold tracking-[0.15em] uppercase mb-1.5">Address</p>
            <p class="text-parchment-100 leading-relaxed">{{ site.name }}<template v-for="line in addressLines" :key="line"><br>{{ line }}</template></p>
          </div>
          <div v-if="site.contactEmail || site.phone">
            <p class="text-gold-400 text-xs font-bold tracking-[0.15em] uppercase mb-1.5">Contact</p>
            <p v-if="site.phone" class="text-parchment-100">{{ site.phone }}</p>
            <p v-if="site.contactEmail" class="text-parchment-100">{{ site.contactEmail }}</p>
          </div>
          <div v-if="shown.length">
            <p class="text-gold-400 text-xs font-bold tracking-[0.15em] uppercase mb-1.5">Service Times</p>
            <p class="text-parchment-100 leading-relaxed">
              <template v-for="(service, i) in shown" :key="i"><br v-if="i">{{ serviceTimeLine(service) }}</template>
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="bg-primary-900 border-t-4 border-gold-500 py-14 px-6">
      <div class="max-w-5xl mx-auto flex flex-wrap gap-12">
        <div class="max-w-xs">
          <SiteLogo sizes="120px" loading="lazy" class="h-20 w-auto mb-4 [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.95))_drop-shadow(0_0_5px_rgba(255,255,255,0.8))_drop-shadow(0_0_10px_rgba(255,255,255,0.5))]" />
          <p class="text-white/60 text-sm font-bold leading-relaxed">Rooted in Faith.<br>Planted in Community.</p>
        </div>
        <div class="flex-1"></div>
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.15em] uppercase mb-4">Quick Links</p>
          <div class="flex flex-col gap-2.5">
            <NuxtLink to="/about" class="text-white/70 text-sm font-bold hover:text-white">About Us</NuxtLink>
            <NuxtLink to="/seeking-pastor" class="text-white/70 text-sm font-bold hover:text-white">Seeking Pastor</NuxtLink>
            <NuxtLink to="/ministries" class="text-white/70 text-sm font-bold hover:text-white">Ministries</NuxtLink>
            <NuxtLink v-if="auth.isMember" to="/missions" class="text-white/70 text-sm font-bold hover:text-white">Missions</NuxtLink>
            <NuxtLink to="/teaching" class="text-white/70 text-sm font-bold hover:text-white">Teaching</NuxtLink>
            <NuxtLink v-if="!auth.isAuthenticated" to="/login" class="text-white/70 text-sm font-bold hover:text-white">Member Login</NuxtLink>
          </div>
        </div>
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.15em] uppercase mb-4">Contact</p>
          <div class="flex flex-col gap-2.5">
            <span v-if="cityLine" class="text-white/70 text-sm font-bold">{{ cityLine }}</span>
            <span v-if="site.phone" class="text-white/70 text-sm font-bold">{{ site.phone }}</span>
            <span v-if="site.contactEmail" class="text-white/70 text-sm font-bold">{{ site.contactEmail }}</span>
          </div>
        </div>
      </div>
      <div class="max-w-5xl mx-auto mt-8 pt-6 border-t border-white/10">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-white/40 text-xs font-bold">© {{ new Date().getFullYear() }} {{ site.name }}<template v-if="placeName"> · {{ placeName }}</template> · All Rights Reserved</p>
          <div class="flex gap-4">
            <NuxtLink to="/privacy" class="text-white/60 text-xs font-bold hover:text-white">Privacy Policy</NuxtLink>
            <NuxtLink to="/terms" class="text-white/60 text-xs font-bold hover:text-white">Terms of Use</NuxtLink>
            <UButton v-if="auth.isAuthenticated && !standalone" variant="link" color="neutral" size="xs" class="p-0 text-white/60 text-xs font-bold hover:text-white" @click="open">Install the app</UButton>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { serviceShown, serviceTimeLine } from '#shared/site'

definePageMeta({
  layout: 'default',
})

const auth = useAuthStore()
const { open, standalone } = useInstallGuide()
const { site, placeName, cityLine, addressLines, directionsUrl } = useSite()

// Each service as it is next going to happen: the Google calendar's date when it
// has the service (so a moved one reads true), the usual day and time otherwise.
const { data: upcoming } = await useFetch('/api/site/services', { key: 'services', default: () => null })
const shown = computed(() => upcoming.value ?? site.value.serviceTimes.map(serviceShown))

// One Google Meet the viewer may join opens directly; anything else goes to
// the Teaching page, which plays YouTube and asks members to sign in.
const { data: live } = await useLiveMeetings()
const join = computed(() => {
  const meetings = live.value?.meetings ?? []
  if (!meetings.length) return null
  const [only] = meetings
  return meetings.length === 1 && only!.kind === 'meet' && only!.link
    ? { to: only!.link, target: '_blank', trailingIcon: 'i-lucide-external-link' }
    : { to: '/teaching#live' }
})

</script>
