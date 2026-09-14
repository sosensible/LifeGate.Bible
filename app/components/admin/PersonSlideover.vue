<template>
  <USlideover v-model:open="open" :title="person ? `Edit ${fullName(person)}` : 'Add a person'" :ui="{ content: 'max-w-xl', footer: 'justify-between' }">
    <template #body>
      <UForm id="person-form" :schema="formSchema" :state="state" class="space-y-8" @submit="save">
        <!-- Record -->
        <section class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="First name" name="firstName" required>
              <UInput v-model="state.firstName" class="w-full" />
            </UFormField>
            <UFormField label="Last name" name="lastName" required>
              <UInput v-model="state.lastName" class="w-full" />
            </UFormField>
            <UFormField label="Title" name="title" hint="e.g. Deacon">
              <UInput v-model="state.title" class="w-full" />
            </UFormField>
            <UFormField label="Household" name="householdId">
              <USelectMenu
                v-model="state.householdId"
                :items="householdItems"
                value-key="id"
                label-key="name"
                placeholder="None"
                create-item
                clear
                class="w-full"
                @create="createHousehold"
              />
            </UFormField>
          </div>
          <UFormField name="isMinor">
            <USwitch v-model="state.isMinor" label="Under 18" description="Minors are never listed to members, whatever is shared." />
          </UFormField>
          <UFormField label="Ministries" name="ministryIds">
            <USelectMenu
              v-model="state.ministryIds"
              :items="ministries"
              value-key="id"
              label-key="name"
              multiple
              placeholder="Not serving yet"
              class="w-full"
            />
          </UFormField>
        </section>

        <!-- Contact -->
        <section class="space-y-4">
          <h3 class="font-serif text-lg font-bold text-highlighted">Contact</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Phone" name="phone">
              <UInput v-model="state.phone" type="tel" class="w-full" />
            </UFormField>
            <UFormField label="Email" name="email">
              <UInput v-model="state.email" type="email" class="w-full" />
            </UFormField>
            <UFormField label="Address" name="address" class="sm:col-span-2">
              <UInput v-model="state.address" class="w-full" />
            </UFormField>
            <UFormField label="Birthday" name="birthday" class="sm:col-span-2">
              <UInput v-if="birthdayVisible" v-model="state.birthday" type="date" class="w-full" />
              <p v-else class="text-toned text-sm">
                <UIcon name="i-lucide-eye-off" class="w-4 h-4 align-text-bottom mr-1" />
                Not shared. {{ person ? person.firstName : 'The person' }} can add and share a birthday from their own profile.
              </p>
            </UFormField>
          </div>
        </section>

        <!-- Sharing -->
        <section v-if="canManagePrivacy" class="space-y-3">
          <h3 class="font-serif text-lg font-bold text-highlighted">Sharing</h3>
          <p class="text-muted text-xs">These are the person's own choices. Change them only when they ask you to; every change is recorded.</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <USwitch v-for="field in sharingFields" :key="field.key" v-model="privacy[field.key]" :label="field.label" />
          </div>
        </section>
      </UForm>

      <!-- Sign-in access (existing people only) -->
      <section v-if="person" class="space-y-3 mt-8 pt-8 border-t border-default">
        <h3 class="font-serif text-lg font-bold text-highlighted">Sign-in access</h3>
        <div v-if="person.account" class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-sm">
            <p class="text-highlighted">{{ person.account.email }}</p>
            <p class="text-muted text-xs">Roles: {{ person.account.role || 'none' }}</p>
          </div>
          <UButton size="sm" variant="outline" color="neutral" :loading="accountBusy" @click="unlinkAccount">Disconnect</UButton>
        </div>
        <template v-else>
          <p class="text-muted text-xs">Connects an existing account with this email, or creates a member account and emails them a link to set a password.</p>
          <div class="flex gap-2">
            <UInput v-model="accountEmail" type="email" placeholder="Email address" class="flex-1" />
            <UButton :loading="accountBusy" :disabled="!accountEmail" @click="linkAccount">Give access</UButton>
          </div>
        </template>
      </section>
    </template>

    <template #footer>
      <UButton v-if="person && canDelete" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmingDelete = true">Remove</UButton>
      <span v-else />
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton type="submit" form="person-form" :loading="saving">{{ person ? 'Save' : 'Add person' }}</UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="confirmingDelete" title="Remove this person?" :description="person ? `${fullName(person)} will be removed from the directory and every ministry. A sign-in account, if any, is kept.` : ''">
    <template #footer>
      <UButton color="neutral" variant="outline" @click="confirmingDelete = false">Keep</UButton>
      <UButton color="error" :loading="deleting" @click="remove">Remove</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { contactFields, personSchema, type AdminPersonView, type HouseholdView, type PrivacyField } from '#shared/people'

const props = defineProps<{
  person: AdminPersonView | null
  households: HouseholdView[]
  ministries: Array<{ id: string, name: string }>
}>()

const emit = defineEmits<{
  saved: [person: AdminPersonView]
  removed: [id: string]
  householdCreated: [household: HouseholdView]
}>()

const open = defineModel<boolean>('open', { required: true })

const auth = useAuthStore()
const toast = useToast()
const canManagePrivacy = computed(() => auth.can({ people: ['managePrivacy'] }))
const canDelete = computed(() => auth.can({ people: ['delete'] }))

const sharingFields: Array<{ key: PrivacyField, label: string }> = [
  { key: 'sharePhone', label: 'Phone with members' },
  { key: 'shareEmail', label: 'Email with members' },
  { key: 'shareAddress', label: 'Address with members' },
  { key: 'shareBirthday', label: 'Birthday with everyone' },
  { key: 'shareHousehold', label: 'Household with everyone' },
  { key: 'sharePhoto', label: 'Photo with everyone' },
]

const blank = () => ({
  firstName: '', lastName: '', title: '', isMinor: false,
  householdId: null as string | null, ministryIds: [] as string[],
  phone: '', email: '', address: '', birthday: '',
})
const blankPrivacy = (): Record<PrivacyField, boolean> => ({
  sharePhone: false, shareEmail: false, shareAddress: false, shareBirthday: false, sharePhoto: false, shareHousehold: false,
})

const state = reactive(blank())
const privacy = reactive(blankPrivacy())
const accountEmail = ref('')

// Names are required; birthday is only validated when it is shown.
const formSchema = personSchema.extend({ birthday: contactFields.birthday.optional() })

// Nobody edits what they cannot see: the birthday is editable here only once
// the person has shared it. Turning sharing on in this form takes effect after saving.
const birthdayVisible = computed(() => Boolean(props.person?.shareBirthday))

const load = () => {
  const p = props.person
  accountEmail.value = p?.email ?? ''
  Object.assign(state, p
    ? {
        firstName: p.firstName, lastName: p.lastName, title: p.title ?? '', isMinor: p.isMinor,
        householdId: p.householdId, ministryIds: p.ministries.map(m => m.id),
        phone: p.phone ?? '', email: p.email ?? '', address: p.address ?? '', birthday: p.birthday ?? '',
      }
    : blank())
  Object.assign(privacy, p
    ? Object.fromEntries(sharingFields.map(({ key }) => [key, p[key]]))
    : blankPrivacy())
}

watch(open, (isOpen) => {
  if (isOpen) load()
}, { immediate: true })

const householdItems = computed(() => props.households.map(({ id, name }) => ({ id, name })))

const createHousehold = async (name: string) => {
  try {
    const { household } = await $fetch('/api/admin/households', { method: 'POST', body: { name } })
    emit('householdCreated', household)
    state.householdId = household.id
  }
  catch (error) {
    toast.add({ title: 'Household not created', description: apiErrorMessage(error), color: 'error' })
  }
}

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const body: Record<string, unknown> = { ...state }
    if (!birthdayVisible.value) delete body.birthday

    let saved = props.person
      ? (await $fetch(`/api/admin/people/${props.person.id}`, { method: 'PATCH', body })).person
      : (await $fetch('/api/admin/people', { method: 'POST', body })).person

    if (canManagePrivacy.value) {
      const changed = Object.fromEntries(sharingFields
        .filter(({ key }) => privacy[key] !== saved[key])
        .map(({ key }) => [key, privacy[key]]))
      if (Object.keys(changed).length) {
        saved = (await $fetch(`/api/admin/people/${saved.id}/privacy`, { method: 'PUT', body: changed })).person
      }
    }

    emit('saved', saved)
    toast.add({ title: props.person ? 'Changes saved' : `${fullName(saved)} added`, color: 'success', icon: 'i-lucide-circle-check' })
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = false
  }
}

const accountBusy = ref(false)
const linkAccount = async () => {
  if (!props.person) return
  accountBusy.value = true
  try {
    const result = await $fetch(`/api/admin/people/${props.person.id}/account`, { method: 'POST', body: { email: accountEmail.value } })
    emit('saved', result.person)
    toast.add({
      title: result.created ? 'Account created' : 'Account connected',
      description: result.created ? `We emailed ${accountEmail.value} a link to set a password.` : undefined,
      color: 'success',
    })
  }
  catch (error) {
    toast.add({ title: 'Sign-in access not given', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    accountBusy.value = false
  }
}

const unlinkAccount = async () => {
  if (!props.person) return
  accountBusy.value = true
  try {
    const result = await $fetch(`/api/admin/people/${props.person.id}/account`, { method: 'DELETE' })
    emit('saved', result.person)
    toast.add({ title: 'Account disconnected', color: 'success' })
  }
  catch (error) {
    toast.add({ title: 'Not disconnected', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    accountBusy.value = false
  }
}

const confirmingDelete = ref(false)
const deleting = ref(false)
const remove = async () => {
  if (!props.person) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/people/${props.person.id}`, { method: 'DELETE' })
    emit('removed', props.person.id)
    toast.add({ title: `${fullName(props.person)} removed`, color: 'success' })
    confirmingDelete.value = false
    open.value = false
  }
  catch (error) {
    toast.add({ title: 'Not removed', description: apiErrorMessage(error), color: 'error' })
  }
  finally {
    deleting.value = false
  }
}
</script>
