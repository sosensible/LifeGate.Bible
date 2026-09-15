<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto flex flex-wrap items-start justify-between gap-6">
        <!-- Title first, so the verse beside it never pushes it down. -->
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Stewardship</p>
          <h1 class="text-4xl font-bold font-serif text-white">{{ title }}</h1>
        </div>
        <div class="flex flex-col items-start sm:items-end gap-4 w-full sm:w-auto sm:max-w-md">
          <UCarousel
            v-slot="{ item }"
            :items="STEWARDSHIP_VERSES"
            :autoplay="{ delay: 12000, stopOnInteraction: false }"
            fade
            loop
            class="w-full"
            aria-label="Scripture"
          >
            <figure class="text-left sm:text-right">
              <blockquote class="font-sans text-sm text-white/90 leading-relaxed">“{{ item.text }}”</blockquote>
              <figcaption class="text-gold-400 text-[0.65rem] font-bold tracking-[0.15em] uppercase mt-1">{{ item.ref }}</figcaption>
            </figure>
          </UCarousel>
          <slot />
        </div>
      </div>
    </div>
    <div v-if="items.length > 1" class="bg-default border-b border-default px-6">
      <UNavigationMenu :items="items" highlight class="max-w-6xl mx-auto" aria-label="Stewardship" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { STEWARDSHIP_VERSES } from '#shared/stewardship-verses'

defineProps<{ title: string }>()

const auth = useAuthStore()

const items = computed<NavigationMenuItem[]>(() => [
  ...(auth.can({ stewardship: ['view'] })
    ? [
        { label: 'Accounts', icon: 'i-lucide-landmark', to: '/admin/stewardship/accounts' },
        { label: 'Transactions', icon: 'i-lucide-list', to: '/admin/stewardship/transactions' },
        // exact: the budget's path is a prefix of every other Stewardship page.
        { label: 'Budget', icon: 'i-lucide-wallet', to: '/admin/stewardship', exact: true },
        { label: 'Categories', icon: 'i-lucide-folder-tree', to: '/admin/stewardship/categories' },
        { label: 'Reports', icon: 'i-lucide-file-chart-column', to: '/admin/stewardship/reports' },
      ]
    : []),
  ...(auth.can({ stewardship: ['grantAccess'] })
    ? [{ label: 'Ministry access', icon: 'i-lucide-shield-check', to: '/admin/stewardship/ministry-access' }]
    : []),
])
</script>
