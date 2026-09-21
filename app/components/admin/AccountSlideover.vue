<template>
  <USlideover v-model:open="open" :title="account ? account.name : 'Add an account'" :description="account?.email" :ui="{ content: 'max-w-xl', footer: 'justify-between' }">
    <template #body>
      <!-- New account -->
      <UForm v-if="!account" id="account-form" :schema="accountCreateSchema" :state="createState" class="space-y-6" @submit="create">
        <UFormField v-if="canLink" label="Directory entry" name="personId" description="Whose account this is. Choosing someone fills in their name and email.">
          <USelectMenu
            v-model="createState.personId"
            :items="personItems"
            value-key="value"
            placeholder="Not in the directory"
            :loading="loadingPeople"
            clear
            class="w-full"
            @update:model-value="fillFromPerson"
          />
        </UFormField>
        <UFormField label="Name" name="name" required>
          <UInput v-model="createState.name" class="w-full" />
        </UFormField>
        <UFormField label="Email" name="email" required description="The address they sign in with.">
          <UInput v-model="createState.email" type="email" class="w-full" />
        </UFormField>
        <UFormField label="Roles" name="roles">
          <UCheckboxGroup v-model="createState.roles" :items="roleItems" />
        </UFormField>
        <UFormField name="sendPasswordLink">
          <USwitch v-model="createState.sendPasswordLink" label="Email them a link to choose a password" description="The link lasts one hour. They can always use “Email me a sign-in link” on the login page instead." />
        </UFormField>
      </UForm>

      <!-- Existing account -->
      <div v-else class="space-y-8">
        <UAlert
          v-if="account.blocked"
          color="error"
          variant="subtle"
          icon="i-lucide-ban"
          title="Blocked"
          :description="account.blockReason ? `Reason: ${account.blockReason}` : 'This account cannot sign in.'"
        />

        <UAlert
          v-if="needsDirectoryEntry(account)"
          color="warning"
          variant="subtle"
          icon="i-lucide-user-round-x"
          title="Not in the directory"
          description="This member login is not connected to a directory entry, so they have no profile and cannot see or set what the directory shares about them."
        />

        <dl class="grid grid-cols-2 gap-4 text-sm">
          <!-- Those who can connect accounts get the Directory entry section below instead. -->
          <div v-if="!canLink">
            <dt class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Directory</dt>
            <dd class="text-toned">
              <NuxtLink v-if="account.person" to="/admin/people" class="text-primary hover:underline">{{ account.person.firstName }} {{ account.person.lastName }}</NuxtLink>
              <span v-else>Not connected</span>
            </dd>
          </div>
          <div>
            <dt class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Last sign-in</dt>
            <dd class="text-toned" :title="account.lastSignInAt ? formatDateTime(account.lastSignInAt) : undefined">
              {{ account.lastSignInAt ? formatRelative(account.lastSignInAt) : 'Never' }}
            </dd>
          </div>
        </dl>

        <section v-if="canLink" class="space-y-3">
          <h3 class="font-serif text-lg font-bold text-highlighted">Directory entry</h3>
          <div v-if="account.person" class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-toned text-sm">Connected to {{ account.person.firstName }} {{ account.person.lastName }}.</p>
            <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-unlink" :loading="busy === 'unlink'" @click="disconnectPerson">Disconnect</UButton>
          </div>
          <template v-else>
            <p class="text-muted text-xs">People who do not have sign-in access yet.</p>
            <div class="flex gap-2">
              <USelectMenu v-model="linkPersonId" :items="personItems" value-key="value" placeholder="Choose a person" :loading="loadingPeople" class="flex-1" />
              <UButton :disabled="!linkPersonId" :loading="busy === 'link'" icon="i-lucide-link" @click="connectPerson">Connect</UButton>
            </div>
          </template>
        </section>

        <section v-if="canSetRoles" class="space-y-3">
          <h3 class="font-serif text-lg font-bold text-highlighted">Roles</h3>
          <UCheckboxGroup v-model="roles" :items="roleItems" />
          <p v-if="isSelf && account.roles.includes('admin')" class="text-muted text-xs">You cannot remove your own administrator role. Another administrator can.</p>
          <UButton :disabled="!rolesChanged" :loading="busy === 'roles'" @click="saveRoles">Save roles</UButton>
        </section>

        <section v-if="!isSelf" class="space-y-3">
          <h3 class="font-serif text-lg font-bold text-highlighted">Access</h3>
          <div class="flex flex-wrap gap-2">
            <UButton v-if="canUpdate && !account.blocked" variant="outline" color="neutral" icon="i-lucide-key-round" :loading="busy === 'password'" @click="sendPasswordLink">Email a password link</UButton>
            <UButton v-if="canRevoke" variant="outline" color="neutral" icon="i-lucide-log-out" :loading="busy === 'signout'" @click="signOutEverywhere">Sign out everywhere</UButton>
            <UButton v-if="canBlock && account.blocked" variant="outline" color="neutral" icon="i-lucide-circle-check" :loading="busy === 'unblock'" @click="unblock">Unblock</UButton>
          </div>
          <div v-if="canBlock && !account.blocked" class="flex gap-2 pt-2">
            <UInput v-model="blockReason" placeholder="Reason (optional, kept in the audit log)" class="flex-1" />
            <UButton color="error" variant="soft" icon="i-lucide-ban" :loading="busy === 'block'" @click="block">Block</UButton>
          </div>
        </section>
      </div>
    </template>

    <template #footer>
      <UButton v-if="account && canDelete && !isSelf" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmingDelete = true">Delete account</UButton>
      <span v-else />
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">{{ account ? 'Close' : 'Cancel' }}</UButton>
        <UButton v-if="!account" type="submit" form="account-form" :loading="busy === 'create'">Create account</UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="confirmingDelete" title="Delete this account?" :description="account ? `${account.email} will no longer be able to sign in. ${account.person ? 'Their directory entry is kept.' : ''}` : ''">
    <template #footer>
      <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep</UButton>
      <UButton color="error" :loading="busy === 'delete'" @click="remove">Delete account</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { accountCreateSchema, needsDirectoryEntry, type AccountView, type UnlinkedPerson } from '#shared/accounts'
import { ASSIGNABLE_ROLES, ROLE_INFO, type AssignableRole } from '#shared/auth/role-info'

const props = defineProps<{ account: AccountView | null }>()
const emit = defineEmits<{ saved: [account: AccountView], removed: [id: string] }>()
const open = defineModel<boolean>('open', { required: true })

const auth = useAuthStore()
const toast = useToast()
const isSelf = computed(() => props.account?.id === auth.user?.id)
const canSetRoles = computed(() => auth.can({ user: ['set-role'] }))
const canUpdate = computed(() => auth.can({ user: ['update'] }))
const canBlock = computed(() => auth.can({ user: ['ban'] }))
const canDelete = computed(() => auth.can({ user: ['delete'] }))
const canRevoke = computed(() => auth.can({ session: ['revoke'] }))
// Connecting accounts to directory entries is directory work.
const canLink = computed(() => auth.can({ people: ['update'] }))

const roleItems = ASSIGNABLE_ROLES.map(value => ({ value, label: ROLE_INFO[value].label, description: ROLE_INFO[value].description }))

const createState = reactive({ name: '', email: '', roles: ['member'] as AssignableRole[], sendPasswordLink: true, personId: undefined as string | null | undefined })

// People without sign-in access, loaded each time the slideover opens.
const unlinkedPeople = ref<UnlinkedPerson[]>([])
const loadingPeople = ref(false)
const personItems = computed(() => unlinkedPeople.value.map(p => ({
  value: p.id,
  label: `${p.lastName}, ${p.firstName}`,
  description: [p.kind === 'guest' ? 'Guest' : null, p.isMinor ? 'Minor' : null, p.email].filter(Boolean).join(' · ') || undefined,
})))
const loadUnlinkedPeople = async () => {
  loadingPeople.value = true
  try {
    unlinkedPeople.value = (await $fetch<{ people: UnlinkedPerson[] }>('/api/admin/accounts/unlinked-people')).people
  }
  catch (error) {
    toast.add({ title: 'Directory entries could not be loaded', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    loadingPeople.value = false
  }
}
const fillFromPerson = (id: string | null | undefined) => {
  const person = unlinkedPeople.value.find(p => p.id === id)
  if (!person) return
  createState.name = `${person.firstName} ${person.lastName}`
  if (person.email) createState.email = person.email
}
const linkPersonId = ref<string | undefined>()
const roles = ref<AssignableRole[]>([])
const blockReason = ref('')
const busy = ref<string | null>(null)
const confirmingDelete = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(createState, { name: '', email: '', roles: ['member'], sendPasswordLink: true, personId: undefined })
  linkPersonId.value = undefined
  if (canLink.value && !props.account?.person) loadUnlinkedPeople()
  roles.value = [...(props.account?.roles ?? [])]
  blockReason.value = ''
}, { immediate: true })

const rolesChanged = computed(() =>
  props.account !== null && [...roles.value].sort().join() !== [...props.account.roles].sort().join(),
)

const run = async <T>(key: string, action: () => Promise<T>, success: string, failure: string) => {
  busy.value = key
  try {
    const result = await action()
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' })
    return result
  }
  catch (error) {
    toast.add({ title: failure, description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    return undefined
  }
  finally {
    busy.value = null
  }
}

type AccountResult = { account: AccountView }
const accountUrl = (suffix = '') => `/api/admin/accounts/${props.account!.id}${suffix}`

const create = async () => {
  const result = await run('create', () => $fetch<AccountResult>('/api/admin/accounts', { method: 'POST', body: createState }),
    createState.sendPasswordLink ? `Account created. We emailed ${createState.email} a password link.` : 'Account created', 'Account not created')
  if (result) {
    emit('saved', result.account)
    open.value = false
  }
}

const connectPerson = async () => {
  const result = await run('link', () => $fetch<AccountResult>(accountUrl('/person'), { method: 'PUT', body: { personId: linkPersonId.value } }), 'Connected to the directory', 'Not connected')
  if (result) {
    linkPersonId.value = undefined
    emit('saved', result.account)
  }
}

const disconnectPerson = async () => {
  const result = await run('unlink', () => $fetch<AccountResult>(accountUrl('/person'), { method: 'DELETE' }), 'Disconnected from the directory', 'Not disconnected')
  if (result) {
    emit('saved', result.account)
    loadUnlinkedPeople()
  }
}

const saveRoles = async () => {
  const result = await run('roles', () => $fetch<AccountResult>(accountUrl('/roles'), { method: 'PUT', body: { roles: roles.value } }), 'Roles saved', 'Roles not saved')
  if (result) emit('saved', result.account)
}

const sendPasswordLink = () =>
  run('password', () => $fetch(accountUrl('/password-link'), { method: 'POST' }), `Password link emailed to ${props.account?.email}`, 'Link not sent')

const signOutEverywhere = () =>
  run('signout', () => $fetch(accountUrl('/sign-out'), { method: 'POST' }), 'Signed out on every device', 'Not signed out')

const block = async () => {
  const result = await run('block', () => $fetch<AccountResult>(accountUrl('/block'), { method: 'POST', body: { reason: blockReason.value } }), 'Account blocked', 'Not blocked')
  if (result) emit('saved', result.account)
}

const unblock = async () => {
  const result = await run('unblock', () => $fetch<AccountResult>(accountUrl('/unblock'), { method: 'POST' }), 'Account unblocked', 'Not unblocked')
  if (result) emit('saved', result.account)
}

const remove = async () => {
  const id = props.account!.id
  const result = await run('delete', () => $fetch(accountUrl(), { method: 'DELETE' }).then(() => true), 'Account deleted', 'Not deleted')
  if (result) {
    emit('removed', id)
    confirmingDelete.value = false
    open.value = false
  }
}
</script>
