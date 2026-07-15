<template>
  <div>
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">Members Directory</h1>
      </div>
    </div>

    <!-- Search -->
    <div class="bg-muted border-b border-default py-5 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="relative max-w-md">
          <UIcon name="i-lucide-search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-600 pointer-events-none" />
          <input
            v-model="search"
            type="text"
            placeholder="Search by name or ministry..."
            class="w-full pl-11 pr-4 py-3 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>
    </div>

    <!-- Cards -->
    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <div v-if="filtered.length === 0" class="text-center py-16">
          <p class="font-serif text-xl text-muted mb-2">No members found</p>
          <p class="text-muted text-sm">Try a different name or ministry</p>
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="m in filtered" :key="m.id" class="bg-elevated rounded-lg overflow-hidden shadow-sm border border-default">
            <div class="h-1.5" :style="{ backgroundColor: m.color }"></div>
            <div class="p-5">
              <div class="flex gap-3.5 items-center mb-4">
                <div class="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white font-bold" :style="{ backgroundColor: m.color }">{{ m.initials }}</div>
                <div class="min-w-0">
                  <h3 class="font-serif font-bold text-highlighted leading-tight">{{ m.name }}</h3>
                  <p class="text-muted text-[11px] uppercase tracking-wide">{{ m.role }}</p>
                </div>
              </div>
              <p class="text-gold-600 text-[9px] tracking-[0.15em] uppercase mb-0.5">Family Unit</p>
              <p class="text-toned text-xs mb-2.5">{{ m.family || 'Individual Member' }}</p>
              <p class="text-gold-600 text-[9px] tracking-[0.15em] uppercase mb-0.5">Ministries</p>
              <p class="text-toned text-xs mb-3.5">{{ m.ministries.join(' · ') }}</p>
              <div class="border-t border-default pt-3.5 flex flex-col gap-2 text-xs text-toned">
                <div class="flex gap-2.5 items-center"><UIcon name="i-lucide-phone" class="w-3.5 h-3.5 text-gold-600 shrink-0" /><span>{{ m.phone }}</span></div>
                <div class="flex gap-2.5 items-center"><UIcon name="i-lucide-mail" class="w-3.5 h-3.5 text-gold-600 shrink-0" /><span>{{ m.email }}</span></div>
                <div class="flex gap-2.5 items-start"><UIcon name="i-lucide-map-pin" class="w-3.5 h-3.5 text-gold-600 shrink-0 mt-0.5" /><span>{{ m.address }}</span></div>
                <div class="flex gap-2.5 items-center"><UIcon name="i-lucide-calendar" class="w-3.5 h-3.5 text-gold-600 shrink-0" /><span>Birthday: {{ m.birthday }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

const search = ref('')

// Demo data until the live member directory is wired in.
const members = [
  { id: 1, name: 'James Mitchell', family: 'Mitchell Family', role: 'Deacon', ministries: ['Worship Team', 'Visitation'], phone: '(269) 555-0101', email: 'jmitchell@lifegate.bible', birthday: 'March 15', address: '123 Oak Street, Eau Claire, MI', initials: 'JM', color: '#1A5C30' },
  { id: 2, name: 'Robert Hayes', family: 'Hayes Family', role: 'Elder', ministries: ['Adult Sunday School'], phone: '(269) 555-0102', email: 'rhayes@lifegate.bible', birthday: 'July 4', address: '456 Maple Ave, Eau Claire, MI', initials: 'RH', color: '#7B1828' },
  { id: 3, name: 'Patricia Summers', family: null, role: 'Member', ministries: ['Children\'s Ministry', 'Nursery'], phone: '(269) 555-0103', email: 'psummers@lifegate.bible', birthday: 'October 22', address: '789 Pine Road, Eau Claire, MI', initials: 'PS', color: '#7A5828' },
  { id: 4, name: 'Thomas Olson', family: 'Olson Family', role: 'Member', ministries: ['Hospitality'], phone: '(269) 555-0104', email: 'tolson@lifegate.bible', birthday: 'February 8', address: '321 Elm Street, Eau Claire, MI', initials: 'TO', color: '#256035' },
  { id: 5, name: 'Dorothy Perkins', family: null, role: 'Member', ministries: ['Choir', 'Prayer Team'], phone: '(269) 555-0105', email: 'dperkins@lifegate.bible', birthday: 'August 30', address: '654 Cedar Lane, Eau Claire, MI', initials: 'DP', color: '#5D1220' },
  { id: 6, name: 'Michael Torres', family: 'Torres Family', role: 'Member', ministries: ['Youth Group', 'Worship Team'], phone: '(269) 555-0106', email: 'mtorres@lifegate.bible', birthday: 'December 12', address: '987 Birch Blvd, Eau Claire, MI', initials: 'MT', color: '#3A4E24' },
  { id: 7, name: 'William Carter', family: null, role: 'Deacon', ministries: ['Grounds & Facilities'], phone: '(269) 555-0107', email: 'wcarter@lifegate.bible', birthday: 'May 19', address: '147 Willow Way, Eau Claire, MI', initials: 'WC', color: '#4A3224' },
  { id: 8, name: 'Helen Johnson', family: 'Johnson Family', role: 'Member', ministries: ['Nursery', 'Hospitality', 'Choir'], phone: '(269) 555-0108', email: 'hjohnson@lifegate.bible', birthday: 'September 3', address: '258 Oak Park Drive, Eau Claire, MI', initials: 'HJ', color: '#2A3C6C' },
]

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return members
  return members.filter(m =>
    m.name.toLowerCase().includes(q)
    || m.ministries.some(min => min.toLowerCase().includes(q)),
  )
})
</script>
