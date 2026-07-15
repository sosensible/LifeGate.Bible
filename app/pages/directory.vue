<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-gold-500 text-xs font-bold tracking-widest uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">Members Directory</h1>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6">
      <div class="mb-6">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name..."
          class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="member in filteredMembers" :key="member.id" class="bg-elevated rounded shadow overflow-hidden">
          <div class="h-1 bg-primary"></div>
          <div class="p-6">
            <h3 class="text-lg font-bold text-highlighted">{{ member.name }}</h3>
            <p class="text-sm text-muted mb-4">{{ member.role }}</p>
            <div class="space-y-2 text-sm">
              <p><span class="font-bold text-gold-500">Email:</span> {{ member.email }}</p>
              <p><span class="font-bold text-gold-500">Phone:</span> {{ member.phone }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="filteredMembers.length === 0" class="text-center py-12">
        <p class="text-muted">No members found</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

const searchQuery = ref('')

const members = [
  { id: 1, name: 'James Mitchell', role: 'Deacon', email: 'james@lifegatebc.org', phone: '(269) 555-0101' },
  { id: 2, name: 'Robert Hayes', role: 'Elder', email: 'robert@lifegatebc.org', phone: '(269) 555-0102' },
  { id: 3, name: 'Patricia Summers', role: 'Member', email: 'patricia@lifegatebc.org', phone: '(269) 555-0103' },
]

const filteredMembers = computed(() => {
  if (!searchQuery.value)
    return members
  return members.filter(m =>
    m.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    || m.email.toLowerCase().includes(searchQuery.value.toLowerCase()),
  )
})
</script>
