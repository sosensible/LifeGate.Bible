<template>
  <div class="min-h-screen flex flex-col">
    <!-- Wide screens: links across the bar. Narrow screens: a menu button opens them in a slideover. -->
    <UHeader
      v-model:open="menuOpen"
      mode="slideover"
      :ui="{
        root: 'bg-primary-800 border-b-0 shadow-md h-[70px]',
        container: 'max-w-5xl',
        toggle: 'text-white hover:bg-white/10',
        header: 'bg-primary-800 h-[70px]',
      }"
    >
      <template #title>
        <SiteLogo sizes="72px" fetchpriority="high" alt="Lifegate Baptist Church - home" class="h-12 w-auto [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.95))_drop-shadow(0_0_3px_rgba(255,255,255,0.8))_drop-shadow(0_0_6px_rgba(255,255,255,0.5))]" />
      </template>

      <UNavigationMenu
        :items="navItems"
        :ui="{ link: 'text-white/85 hover:text-white hover:before:bg-white/10 data-active:text-white data-active:before:bg-white/15' }"
      />

      <template #right>
        <UButton v-if="auth.isMember" to="/members" size="sm" color="secondary" class="hidden lg:inline-flex">Members</UButton>
        <UDropdownMenu v-if="auth.isAuthenticated" :items="accountMenu" :content="{ align: 'end' }">
          <UButton variant="outline" size="sm" trailing-icon="i-lucide-chevron-down" class="text-white ring-white/40 hover:bg-white/10">
            {{ auth.user?.name?.split(' ')[0] || 'Account' }}
          </UButton>
        </UDropdownMenu>
        <UButton v-else to="/login" size="sm" color="secondary">Member Login</UButton>
      </template>

      <template #body>
        <UNavigationMenu :items="mobileNavItems" orientation="vertical" class="-mx-2.5" @click="closeOnLink" />
      </template>
    </UHeader>
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
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const auth = useAuthStore()
const route = useRoute()

const siteLinks = computed<NavigationMenuItem[]>(() => [
  { label: 'About', icon: 'i-lucide-info', to: '/about' },
  ...(auth.isMember
    ? [
        { label: 'Teaching', icon: 'i-lucide-book-open', to: '/teaching' },
        { label: 'Calendar', icon: 'i-lucide-calendar', to: '/calendar' },
        { label: 'Directory', icon: 'i-lucide-users', to: '/directory' },
        { label: 'Ministries', icon: 'i-lucide-hand-heart', to: '/ministries' },
        { label: 'Missions', icon: 'i-lucide-globe', to: '/missions' },
      ]
    : []),
])
// The bar shows text only; Members is a button beside it.
const navItems = computed(() => siteLinks.value.map(({ icon: _icon, ...item }) => item))
// The slideover menu keeps the icons and lists Members first.
const mobileNavItems = computed<NavigationMenuItem[]>(() => [
  ...(auth.isMember ? [{ label: 'Members', icon: 'i-lucide-house', to: '/members' }] : []),
  ...siteLinks.value,
])
// Any link tapped in the slideover closes it, including the page already showing.
const menuOpen = ref(false)
const closeOnLink = (event: MouseEvent) => {
  if ((event.target as HTMLElement).closest('a')) menuOpen.value = false
}

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

// Help pages exist for the office jobs; only those roles get the menu entry.
const hasHelp = computed(() => auth.can({ giving: ['record'] }) || auth.can({ stewardship: ['view'] }))

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
  // Help for office work: shown to those who have at least one help page.
  ...(hasHelp.value ? [[{ label: 'Help', icon: 'i-lucide-circle-question-mark', to: '/help' }]] : []),
  [{ label: 'Sign Out', icon: 'i-lucide-log-out', onSelect: handleLogout }],
].filter(group => group.length))
</script>
