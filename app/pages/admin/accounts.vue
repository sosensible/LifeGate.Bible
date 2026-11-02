<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Church Office</p>
          <h1 class="text-4xl font-bold font-serif text-white">Accounts</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton variant="outline" icon="i-lucide-shield-check" class="text-white ring-white/40 hover:bg-white/10" @click="rolesOpen = true">Roles</UButton>
          <UButton v-if="canCreate" color="secondary" icon="i-lucide-user-plus" @click="openEditor(null)">Add account</UButton>
        </div>
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
            <UTable :data="paged" :columns="columns" empty="No accounts match that search.">
              <template #account-cell="{ row }">
                <div class="flex items-center gap-3">
                  <!-- The avatar goes to the member's page; an account with none opens the account instead. -->
                  <NuxtLink v-if="row.original.person" :to="`/people/${row.original.person.id}`" class="shrink-0" :aria-label="`Open ${row.original.person.firstName} ${row.original.person.lastName}’s page`">
                    <UAvatar :src="row.original.person.photoUrl ?? undefined" :alt="row.original.name" :text="initialsOfName(row.original.name)" size="md" />
                  </NuxtLink>
                  <button v-else type="button" class="shrink-0" :aria-label="`Manage ${row.original.name}`" @click="openEditor(row.original)">
                    <UAvatar :alt="row.original.name" :text="initialsOfName(row.original.name)" size="md" />
                  </button>
                  <button type="button" class="text-left group min-w-0" @click="openEditor(row.original)">
                    <span class="block font-bold text-highlighted group-hover:text-primary">
                      {{ row.original.name }}
                      <UBadge v-if="row.original.id === auth.user?.id" size="sm" variant="subtle" color="neutral" class="ml-1">You</UBadge>
                    </span>
                    <span class="block text-muted text-xs">{{ row.original.email }}</span>
                  </button>
                </div>
              </template>
              <template #roles-cell="{ row }">
                <!-- Being a member is what almost everyone is, and is shown by the directory link instead. -->
                <div class="flex flex-wrap gap-1">
                  <UBadge v-for="role in shownRoles(row.original)" :key="role" size="sm" variant="subtle" :color="role === 'admin' ? 'error' : 'primary'">{{ ROLE_INFO[role].label }}</UBadge>
                  <span v-if="!row.original.roles.length" class="text-muted text-xs">No role</span>
                  <span v-else-if="!shownRoles(row.original).length" class="text-muted text-xs">—</span>
                </div>
              </template>
              <template #person-cell="{ row }">
                <NuxtLink v-if="row.original.person" :to="`/people/${row.original.person.id}`" class="text-primary hover:underline text-xs inline-flex items-center gap-1">
                  <UIcon name="i-lucide-id-card" class="size-3.5" />{{ row.original.person.firstName }} {{ row.original.person.lastName }}
                </NuxtLink>
                <div v-else-if="needsDirectoryEntry(row.original)" class="flex flex-wrap items-center gap-2">
                  <UBadge size="sm" variant="subtle" color="warning" icon="i-lucide-user-round-x">Not in directory</UBadge>
                  <UButton v-if="canCreateEntry" size="xs" variant="outline" color="neutral" icon="i-lucide-user-round-plus" :loading="creatingEntry === row.original.id" @click="createEntry(row.original)">Create entry</UButton>
                </div>
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

          <div v-if="filtered.length > pageSize" class="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p class="text-muted text-sm">{{ firstShown }}–{{ lastShown }} of {{ filtered.length }}</p>
            <UPagination v-model:page="page" :total="filtered.length" :items-per-page="pageSize" />
          </div>
        </section>
      </div>
    </div>

    <AdminRolesModal v-model:open="rolesOpen" />
    <AdminAccountSlideover v-model:open="editorOpen" :account="editing" @saved="onSaved" @removed="onRemoved" />
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { needsDirectoryEntry, type AccountView } from '#shared/accounts'
import type { AssignableRole } from '#shared/auth/role-info'
import { ROLE_INFO } from '#shared/auth/role-info'

definePageMeta({
  middleware: 'auth',
  permission: { user: ['list'] },
  layout: 'default',
})
useSeoMeta({ title: 'Accounts' })

const auth = useAuthStore()
const toast = useToast()
const canCreate = computed(() => auth.can({ user: ['create', 'set-role'] }))
// Making a directory entry for an account is directory work as well as account work.
const canCreateEntry = computed(() => auth.can({ user: ['list'], people: ['create', 'update'] }))
const rolesOpen = ref(false)

// "Jane Q Public" -> JP. An account has one name; this is only for its avatar.
const initialsOfName = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1]![0]! : '')).toUpperCase()
}
const shownRoles = (account: AccountView): AssignableRole[] => account.roles.filter(role => role !== 'member')

const { data, error } = await useFetch('/api/admin/accounts')
const accounts = ref<AccountView[]>(data.value?.accounts ?? [])
watch(data, value => accounts.value = value?.accounts ?? [])

const columns: TableColumn<AccountView>[] = [
  { id: 'account', header: 'Account' },
  { id: 'roles', header: 'Roles' },
  { id: 'person', header: 'Member' },
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

// Twelve at a time, so the list stays short enough to scan.
const pageSize = 12
const page = ref(1)
watch([search, onlyNotInDirectory], () => { page.value = 1 })
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const firstShown = computed(() => (page.value - 1) * pageSize + 1)
const lastShown = computed(() => Math.min(page.value * pageSize, filtered.value.length))

const creatingEntry = ref<string | null>(null)
const createEntry = async (account: AccountView) => {
  creatingEntry.value = account.id
  try {
    const result = await $fetch<{ account: AccountView }>(`/api/admin/accounts/${account.id}/person`, { method: 'POST' })
    accounts.value = accounts.value.map(a => a.id === account.id ? result.account : a)
    toast.add({ title: 'Directory entry created', description: `${account.name} is now in the directory. Fill in the rest on the People page.`, color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (error) {
    toast.add({ title: 'Not created', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    creatingEntry.value = null
  }
}

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
