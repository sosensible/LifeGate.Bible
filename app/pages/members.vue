<template>
  <div>
    <!-- Welcome header -->
    <div class="bg-primary-800 py-12 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">Welcome Home</h1>
        <p class="text-white/70 mt-2 max-w-2xl">Everything for the Lifegate family in one place — teaching, the church calendar, our directory, and ministries.</p>
      </div>
    </div>

    <!-- Hub cards -->
    <div class="bg-default py-12 px-6">
      <div class="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
        <component
          :is="tile.to ? NuxtLink : 'button'"
          v-for="tile in shownTiles"
          :key="tile.title"
          v-bind="tile.to ? { to: tile.to } : { type: 'button', onClick: open }"
          class="text-left bg-elevated rounded-lg border border-default shadow-sm p-7 block hover:border-primary transition-colors group"
        >
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-lg bg-primary-800 flex items-center justify-center shrink-0">
              <UIcon :name="tile.icon" class="w-6 h-6 text-gold-400" />
            </div>
            <div>
              <h2 class="font-serif text-xl font-bold text-highlighted mb-1 group-hover:text-primary transition-colors">{{ tile.title }}</h2>
              <p class="text-toned text-sm leading-relaxed">{{ tile.description }}</p>
            </div>
          </div>
        </component>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

const NuxtLink = resolveComponent('NuxtLink')
const { open, standalone } = useInstallGuide()

// A tile with a `to` is a link; one without is a button that opens the install dialog.
const tiles: Array<{ to?: string, icon: string, title: string, description: string }> = [
  { to: '/me', icon: 'i-lucide-id-card', title: 'My Page', description: 'Your page: how others see you, and what is waiting for you across the church.' },
  { to: '/teaching', icon: 'i-lucide-book-open', title: 'Teaching', description: 'Watch and listen to preaching, lessons, and Bible studies from Lifegate.' },
  { to: '/calendar', icon: 'i-lucide-calendar-days', title: 'Church Calendar', description: 'Upcoming services, events, and gatherings for the whole church family.' },
  { to: '/directory', icon: 'i-lucide-users', title: 'Members Directory', description: 'Find fellow members of Lifegate and the details they have chosen to share.' },
  { to: '/missions', icon: 'i-lucide-globe', title: 'Missions', description: 'The missionaries we support, their prayer requests and letters.' },
  { to: '/ministries', icon: 'i-lucide-hand-heart', title: 'Ministries', description: 'Explore how our church serves and find a place to get involved.' },
  { to: '/profile', icon: 'i-lucide-user-round-cog', title: 'My Profile', description: 'Keep your details current and choose what the directory shows about you.' },
  { icon: 'i-lucide-smartphone', title: 'Install the App', description: 'Add the church app to your phone’s home screen or your computer. It opens in its own window, and pages you have visited can be read without a signal.' },
]

// The install tile goes once the site is already running as an app.
const shownTiles = computed(() => tiles.filter(tile => tile.to || !standalone.value))
</script>
