<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-5xl mx-auto flex items-center justify-between">
        <div>
          <p class="text-gold-500 text-xs font-bold tracking-widest uppercase mb-2">Members Area</p>
          <h1 class="text-4xl font-bold font-serif text-white">Members Directory</h1>
        </div>
        <UButton @click="showAddForm = true" color="primary" size="md">+ Add Member</UButton>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6">
      <!-- Add Member Form -->
      <div v-if="showAddForm" class="mb-12 bg-elevated rounded shadow p-8">
        <h3 class="text-2xl font-bold font-serif text-highlighted mb-6">Add New Member</h3>
        <form @submit.prevent="handleAddMember" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-bold text-toned mb-2">Name *</label>
              <input v-model="addForm.name" type="text" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-toned mb-2">Email *</label>
              <input v-model="addForm.email" type="email" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-toned mb-2">Role</label>
              <select v-model="addForm.role" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm">
                <option value="member">Member</option>
                <option value="deacon">Deacon</option>
                <option value="elder">Elder</option>
                <option value="pastor">Pastor</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-bold text-toned mb-2">Phone</label>
              <input v-model="addForm.phone" type="tel" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-bold text-toned mb-2">Address</label>
              <input v-model="addForm.address" type="text" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-toned mb-2">Birthday</label>
              <input v-model="addForm.birthday" type="date" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-toned mb-2">Family Unit</label>
              <input v-model="addForm.familyUnit" type="text" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-bold text-toned mb-2">Ministries (comma-separated)</label>
              <textarea v-model="addForm.ministries" rows="2" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm"></textarea>
            </div>
          </div>

          <div v-if="addError" class="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {{ addError }}
          </div>

          <div class="flex gap-3">
            <UButton type="submit" :loading="adding" color="primary">Add Member</UButton>
            <UButton type="button" @click="showAddForm = false" variant="outline" color="neutral">Cancel</UButton>
          </div>
        </form>
      </div>

      <!-- Search -->
      <div class="mb-6">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name or email..."
          class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <!-- Members Table -->
      <div class="bg-elevated rounded shadow overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-muted border-b border-default">
            <tr>
              <th class="text-left p-4 font-bold text-highlighted">Name</th>
              <th class="text-left p-4 font-bold text-highlighted">Email</th>
              <th class="text-left p-4 font-bold text-highlighted">Role</th>
              <th class="text-left p-4 font-bold text-highlighted">Phone</th>
              <th class="text-left p-4 font-bold text-highlighted">Ministries</th>
              <th class="text-left p-4 font-bold text-highlighted">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in filteredMembers" :key="member.id" class="border-b border-accented hover:bg-default">
              <td class="p-4 font-bold text-highlighted">{{ member.name }}</td>
              <td class="p-4 text-toned">{{ member.email }}</td>
              <td class="p-4">
                <span class="px-2 py-1 bg-accented text-highlighted text-xs font-bold rounded">{{ member.role }}</span>
              </td>
              <td class="p-4 text-toned">{{ member.phone || '—' }}</td>
              <td class="p-4 text-toned text-xs">{{ member.ministries || '—' }}</td>
              <td class="p-4">
                <UButton @click="editMember(member)" variant="ghost" color="primary" size="xs">Edit</UButton>
              </td>
            </tr>
          </tbody>
        </table>
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
  name: 'admin-directory',
})

const showAddForm = ref(false)
const adding = ref(false)
const addError = ref('')
const searchQuery = ref('')
const members = ref<any[]>([])

const addForm = reactive({
  name: '',
  email: '',
  role: 'member',
  phone: '',
  address: '',
  birthday: '',
  familyUnit: '',
  ministries: '',
})

const filteredMembers = computed(() => {
  if (!searchQuery.value)
    return members.value
  const q = searchQuery.value.toLowerCase()
  return members.value.filter(m =>
    m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
  )
})

const fetchMembers = async () => {
  try {
    const { data } = await useFetch('/api/members')
    members.value = data.value?.members || []
  }
  catch (err) {
    console.error('Failed to fetch members', err)
  }
}

const handleAddMember = async () => {
  addError.value = ''
  adding.value = true

  try {
    const response = await $fetch('/api/members/add', {
      method: 'POST',
      body: addForm,
    })

    if (response.success) {
      addForm.name = ''
      addForm.email = ''
      addForm.role = 'member'
      addForm.phone = ''
      addForm.address = ''
      addForm.birthday = ''
      addForm.familyUnit = ''
      addForm.ministries = ''
      showAddForm.value = false
      await fetchMembers()
    }
  }
  catch (err: any) {
    addError.value = err.message || 'Failed to add member'
  }
  finally {
    adding.value = false
  }
}

const editMember = (member: any) => {
  console.log('Edit member:', member)
  // TODO: Open edit modal/form
}

onMounted(() => {
  fetchMembers()
})
</script>
