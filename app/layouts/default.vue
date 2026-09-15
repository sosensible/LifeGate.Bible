<template>
  <div class="min-h-screen flex flex-col">
    <nav class="sticky top-0 z-50 bg-primary-800 shadow-md">
      <div class="max-w-5xl mx-auto px-6 h-[70px] flex items-center justify-between">
        <NuxtLink to="/" aria-label="Lifegate Baptist Church - home">
          <img src="/logo.png" alt="Lifegate Baptist Church" class="h-12 w-auto [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.95))_drop-shadow(0_0_3px_rgba(255,255,255,0.8))_drop-shadow(0_0_6px_rgba(255,255,255,0.5))]" />
        </NuxtLink>
        <div class="flex items-center gap-4">
          <UButton to="/about" variant="ghost" class="text-white hover:bg-white/10">About</UButton>
          <template v-if="auth.isMember">
            <UButton to="/teaching" variant="ghost" class="text-white hover:bg-white/10">Teaching</UButton>
            <UButton to="/calendar" variant="ghost" class="text-white hover:bg-white/10">Calendar</UButton>
            <UButton to="/directory" variant="ghost" class="text-white hover:bg-white/10">Directory</UButton>
            <UButton to="/ministries" variant="ghost" class="text-white hover:bg-white/10">Ministries</UButton>
            <UButton to="/missions" variant="ghost" class="text-white hover:bg-white/10">Missions</UButton>
            <UButton to="/members" size="sm" color="secondary">Members</UButton>
          </template>
          <UDropdownMenu v-if="auth.isAuthenticated" :items="accountMenu" :content="{ align: 'end' }">
            <UButton variant="outline" size="sm" trailing-icon="i-lucide-chevron-down" class="text-white ring-white/40 hover:bg-white/10">
              {{ auth.user?.name?.split(' ')[0] || 'Account' }}
            </UButton>
          </UDropdownMenu>
          <UButton v-else to="/login" size="sm" color="secondary">Member Login</UButton>
        </div>
      </div>
    </nav>
    <div class="flex-1">
      <slot />
    </div>
    <!-- The home page has its own full footer. -->
    <footer v-if="route.path !== '/'" class="bg-primary-900 border-t border-white/10 py-5 px-6">
      <div class="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <p class="text-white/50 text-xs font-bold">© {{ new Date().getFullYear() }} Lifegate Baptist Church · Eau Claire, Michigan</p>
        <div class="flex gap-4">
          <NuxtLink to="/privacy" class="text-white/60 text-xs font-bold hover:text-white">Privacy Policy</NuxtLink>
          <NuxtLink to="/terms" class="text-white/60 text-xs font-bold hover:text-white">Terms of Use</NuxtLink>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const auth = useAuthStore()
const route = useRoute()

const handleLogout = async () => {
  await auth.logout()
  await navigateTo('/')
}

// Ministry budgets shared with this person (through the ministries they serve in).
const { data: ministryBudgets, refresh: refreshMinistryBudgets } = useLazyFetch('/api/stewardship/ministries', {
  server: false,
  immediate: auth.isAuthenticated,
  default: () => ({ ministries: [] }),
})
// Messages that name this person as their teacher.
const { data: myTeaching, refresh: refreshMyTeaching } = useLazyFetch('/api/teaching/mine', {
  server: false,
  immediate: auth.isAuthenticated,
  default: () => ({ sermons: [], series: [] }),
})
watch(() => auth.user?.id, (id) => {
  if (id) {
    refreshMinistryBudgets()
    refreshMyTeaching()
  }
  else {
    ministryBudgets.value = { ministries: [] }
    myTeaching.value = { sermons: [], series: [] }
  }
})

const accountMenu = computed<DropdownMenuItem[][]>(() => [
  [
    ...(auth.isMember ? [{ label: 'My Profile', icon: 'i-lucide-user-round', to: '/profile' }] : []),
    ...(ministryBudgets.value.ministries.length ? [{ label: 'Ministry budget', icon: 'i-lucide-wallet', to: '/ministry-budget' }] : []),
    ...(myTeaching.value.sermons.length ? [{ label: 'My teaching', icon: 'i-lucide-book-open', to: '/my-teaching' }] : []),
    ...(auth.can({ people: ['update'] }) ? [{ label: 'People', icon: 'i-lucide-users-round', to: '/admin/people' }] : []),
    ...(auth.can({ sermon: ['update'] }) ? [{ label: 'Manage teaching', icon: 'i-lucide-video', to: '/admin/teaching' }] : []),
    ...(auth.can({ ministry: ['update'] }) ? [{ label: 'Ministries', icon: 'i-lucide-hand-heart', to: '/admin/ministries' }] : []),
    ...(auth.can({ stewardship: ['view'] })
      ? [{ label: 'Stewardship', icon: 'i-lucide-hand-coins', to: '/admin/stewardship' }]
      : auth.can({ giving: ['record'] }) ? [{ label: 'Offerings', icon: 'i-lucide-hand-coins', to: '/admin/stewardship/offerings' }] : []),
    ...(auth.can({ stewardship: ['grantAccess'] }) && !auth.can({ stewardship: ['view'] }) ? [{ label: 'Ministry budget access', icon: 'i-lucide-shield-check', to: '/admin/stewardship/ministry-access' }] : []),
    ...(auth.can({ user: ['list'] }) ? [{ label: 'Accounts', icon: 'i-lucide-key-round', to: '/admin/accounts' }] : []),
    ...(auth.can({ audit: ['view'] }) ? [{ label: 'Audit log', icon: 'i-lucide-scroll-text', to: '/admin/audit' }] : []),
  ],
  [{ label: 'Sign Out', icon: 'i-lucide-log-out', onSelect: handleLogout }],
].filter(group => group.length))
</script>
