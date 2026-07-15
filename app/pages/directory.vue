<template>
  <div>
    <div class="bg-[#294231] py-10 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-[#C4993C] text-xs font-bold tracking-widest uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">Members Directory</h1>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6">
      <div class="mb-6">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name..."
          class="w-full px-4 py-2 border border-[#C8B89A] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5C30]"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="member in filteredMembers" :key="member.id" class="bg-white rounded shadow overflow-hidden">
          <div class="h-1 bg-[#1A5C30]"></div>
          <div class="p-6">
            <h3 class="text-lg font-bold text-[#2A1A0E]">{{ member.name }}</h3>
            <p class="text-sm text-[#8C7050] mb-4">{{ member.role }}</p>
            <div class="space-y-2 text-sm">
              <p><span class="font-bold text-[#C4993C]">Email:</span> {{ member.email }}</p>
              <p><span class="font-bold text-[#C4993C]">Phone:</span> {{ member.phone }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="filteredMembers.length === 0" class="text-center py-12">
        <p class="text-[#8C7050]">No members found</p>
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
