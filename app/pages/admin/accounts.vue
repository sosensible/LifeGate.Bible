<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Church Office</p>
          <h1 class="text-4xl font-bold font-serif text-white">Accounts</h1>
        </div>
        <UButton v-if="canCreate" color="secondary" icon="i-lucide-user-plus" @click="openEditor(null)">Add account</UButton>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-12">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Accounts could not be loaded.')" />

        <section v-else>
          <p class="text-toned text-sm mb-4 max-w-3xl">
            An account is how someone signs in. It is separate from their directory entry, which you connect by opening the account here, or on the
            <NuxtLink to="/admin/people" class="text-primary hover:underline">People</NuxtLink> page. Nobody can create their own account.
          </p>
          <UAlert
            v-if="notInDirectoryCount"
            color="warning"
            variant="subtle"
            icon="i-lucide-user-round-x"
            class="mb-4"
            :title="`${notInDirectoryCount} member ${notInDirectoryCount === 1 ? 'login is' : 'logins are'} not in the directory`"
            description="They reach the members area but have no profile. Open one to connect it to its directory entry."
            :actions="[{ label: onlyNotInDirectory ? 'Show all accounts' : 'Show only these', color: 'warning', variant: 'outline', onClick: () => { onlyNotInDirectory = !onlyNotInDirectory } }]"
          />
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <UInput v-model="search" icon="i-lucide-search" placeholder="Search name, email or role..." class="w-full max-w-md" />
            <p class="text-muted text-sm">{{ filtered.length }} of {{ accounts.length }}</p>
          </div>

          <div class="bg-elevated rounded-lg border border-default overflow-x-auto">
            <UTable :data="filtered" :columns="columns" empty="No accounts match that search.">
              <template #account-cell="{ row }">
                <button type="button" class="text-left group" @click="openEditor(row.original)">
                  <span class="block font-bold text-highlighted group-hover:text-primary">
                    {{ row.original.name }}
                    <UBadge v-if="row.original.id === auth.user?.id" size="sm" variant="subtle" color="neutral" class="ml-1">You</UBadge>
                  </span>
                  <span class="block text-muted text-xs">{{ row.original.email }}</span>
                </button>
              </template>
              <template #roles-cell="{ row }">
                <div class="flex flex-wrap gap-1">
                  <UBadge v-for="role in row.original.roles" :key="role" size="sm" variant="subtle" :color="role === 'admin' ? 'error' : 'primary'">{{ ROLE_INFO[role].label }}</UBadge>
                  <span v-if="!row.original.roles.length" class="text-muted text-xs">No role</span>
                </div>
              </template>
              <template #person-cell="{ row }">
                <span v-if="row.original.person" class="text-toned text-xs">{{ row.original.person.firstName }} {{ row.original.person.lastName }}</span>
                <UBadge v-else-if="needsDirectoryEntry(row.original)" size="sm" variant="subtle" color="warning" icon="i-lucide-user-round-x">Not in directory</UBadge>
                <span v-else class="text-toned text-xs">—</span>
              </template>
              <template #lastSignIn-cell="{ row }">
                <span class="text-toned text-xs whitespace-nowrap" :title="row.original.lastSignInAt ? formatDateTime(row.original.lastSignInAt) : undefined">
                  {{ row.original.lastSignInAt ? formatRelative(row.original.lastSignInAt) : 'Never' }}
                </span>
              </template>
              <template #status-cell="{ row }">
                <UBadge v-if="row.original.blocked" size="sm" variant="subtle" color="error" icon="i-lucide-ban">Blocked</UBadge>
              </template>
              <template #actions-cell="{ row }">
                <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-pencil" :aria-label="`Manage ${row.original.name}`" @click="openEditor(row.original)" />
              </template>
            </UTable>
          </div>
        </section>

        <!-- What each role does -->
        <section>
          <h2 class="font-serif text-2xl font-bold text-highlighted mb-1">Roles</h2>
          <p class="text-toned text-sm mb-4">An account can hold several roles; it gets everything each one allows. Roles are defined in the site’s code, so adding a new kind of role is a development change.</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="role in ASSIGNABLE_ROLES" :key="role" class="bg-elevated rounded-lg border border-default p-5">
              <p class="font-bold text-highlighted">{{ ROLE_INFO[role].label }}</p>
              <p class="text-toned text-sm mb-3">{{ ROLE_INFO[role].description }}</p>
              <div class="flex flex-wrap gap-1">
                <UBadge v-for="label in permissionLabels(role)" :key="label" size="sm" variant="outline" color="neutral">{{ label }}</UBadge>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <AdminAccountSlideover v-model:open="editorOpen" :account="editing" @saved="onSaved" @removed="onRemoved" />
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { needsDirectoryEntry, type AccountView } from '#shared/accounts'
import { ASSIGNABLE_ROLES, permissionLabels, ROLE_INFO } from '#shared/auth/role-info'

definePageMeta({
  middleware: 'auth',
  permission: { user: ['list'] },
  layout: 'default',
})
useSeoMeta({ title: 'Accounts | Lifegate Baptist Church' })

const auth = useAuthStore()
const canCreate = computed(() => auth.can({ user: ['create', 'set-role'] }))

const { data, error } = await useFetch('/api/admin/accounts')
const accounts = ref<AccountView[]>(data.value?.accounts ?? [])
watch(data, value => accounts.value = value?.accounts ?? [])

const columns: TableColumn<AccountView>[] = [
  { id: 'account', header: 'Account' },
  { id: 'roles', header: 'Roles' },
  { id: 'person', header: 'Directory' },
  { id: 'lastSignIn', header: 'Last sign-in' },
  { id: 'status', header: '' },
  { id: 'actions', header: '' },
]

// Member logins with no directory entry.
const notInDirectoryCount = computed(() => accounts.value.filter(needsDirectoryEntry).length)
const onlyNotInDirectory = ref(false)
watch(notInDirectoryCount, (count) => { if (!count) onlyNotInDirectory.value = false })

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = onlyNotInDirectory.value ? accounts.value.filter(needsDirectoryEntry) : accounts.value
  if (!q) return list
  return list.filter(a =>
    [a.name, a.email, ...a.roles.map(r => ROLE_INFO[r].label)].some(value => value.toLowerCase().includes(q)),
  )
})

const editorOpen = ref(false)
const editing = ref<AccountView | null>(null)
const openEditor = (account: AccountView | null) => {
  editing.value = account
  editorOpen.value = true
}

const onSaved = async (saved: AccountView) => {
  accounts.value = [...accounts.value.filter(a => a.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name))
  if (editing.value?.id === saved.id) editing.value = saved
  // Your own roles may have changed what you can see.
  if (saved.id === auth.user?.id) await auth.refresh()
}

const onRemoved = (id: string) => {
  accounts.value = accounts.value.filter(a => a.id !== id)
  editing.value = null
}
</script>
