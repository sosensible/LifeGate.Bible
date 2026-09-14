<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">My Profile</h1>
        <p class="text-white/70 mt-2 max-w-2xl">Keep your details current and choose what the church directory shows about you.</p>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" description="Your profile could not be loaded. Please try again." />

        <div v-else-if="!person" class="bg-muted border border-default rounded-lg p-8 text-center max-w-xl mx-auto">
          <UIcon name="i-lucide-user-round-search" class="w-7 h-7 text-gold-600 mx-auto mb-3" />
          <p class="font-serif text-xl text-highlighted mb-2">Your account is not connected to a directory entry yet</p>
          <p class="text-toned text-sm">Ask the church office to connect it. Until then, nothing about you is listed in the directory.</p>
        </div>

        <UForm v-else :schema="schema" :state="state" class="grid grid-cols-1 lg:grid-cols-5 gap-8" @submit="save">
          <div class="lg:col-span-3 space-y-8">
            <!-- Kept by the church office -->
            <section class="bg-elevated rounded-lg border border-default p-6">
              <h2 class="font-serif text-xl font-bold text-highlighted mb-1">{{ fullName(person) }}</h2>
              <p v-if="person.title" class="text-muted text-xs uppercase tracking-wide mb-3">{{ person.title }}</p>
              <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-3">
                <div>
                  <dt class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Household</dt>
                  <dd class="text-toned">{{ person.householdName ?? 'None' }}</dd>
                </div>
                <div>
                  <dt class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Ministries</dt>
                  <dd class="text-toned">{{ person.ministries.map(m => m.name).join(', ') || 'None yet' }}</dd>
                </div>
              </dl>
              <p class="text-muted text-xs mt-4">Your name, title, household and ministries are kept by the church office. Contact them to change these.</p>
            </section>

            <!-- Contact details -->
            <section class="bg-elevated rounded-lg border border-default p-6 space-y-4">
              <h2 class="font-serif text-xl font-bold text-highlighted">Your details</h2>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormField label="Phone" name="phone">
                  <UInput v-model="state.phone" type="tel" autocomplete="tel" class="w-full" />
                </UFormField>
                <UFormField label="Email for the directory" name="email" hint="Not your sign-in email">
                  <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
                </UFormField>
                <UFormField label="Address" name="address" class="sm:col-span-2">
                  <UInput v-model="state.address" autocomplete="street-address" class="w-full" />
                </UFormField>
                <UFormField label="Birthday" name="birthday" hint="Only the month and day are ever shown">
                  <UInput v-model="state.birthday" type="date" class="w-full" />
                </UFormField>
              </div>
            </section>

            <!-- Sharing -->
            <section class="bg-elevated rounded-lg border border-default p-6">
              <h2 class="font-serif text-xl font-bold text-highlighted mb-1">Who can see what</h2>
              <p class="text-toned text-sm mb-5">Everyone signed in as a member sees your name, title and ministries. Everything below is your choice.</p>
              <ul class="divide-y divide-default">
                <li v-for="row in sharingRows" :key="row.key" class="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <p class="font-bold text-highlighted text-sm">{{ row.label }}</p>
                    <p class="text-muted text-xs">{{ row.note }}</p>
                  </div>
                  <USwitch v-model="state[row.key]" :aria-label="`Share ${row.label.toLowerCase()}`" />
                </li>
              </ul>
            </section>

            <div class="flex items-center gap-3">
              <UButton type="submit" size="lg" :loading="saving" :disabled="!dirty" class="uppercase tracking-wide font-bold">Save changes</UButton>
              <UButton v-if="dirty" variant="ghost" color="neutral" @click="reset">Undo changes</UButton>
            </div>
          </div>

          <!-- Live preview -->
          <aside class="lg:col-span-2 space-y-6">
            <div>
              <p class="text-gold-600 text-xs font-bold tracking-[0.2em] uppercase mb-3">How other members see you</p>
              <DirectoryCard v-if="memberPreview" :entry="memberPreview" :link-ministries="false" />
              <p v-else class="text-toned text-sm bg-muted border border-default rounded-lg p-5">Members do not see you in the directory.</p>
            </div>
            <div>
              <p class="text-gold-600 text-xs font-bold tracking-[0.2em] uppercase mb-3">How church staff see you</p>
              <DirectoryCard v-if="staffPreview" :entry="staffPreview" :link-ministries="false" />
            </div>
            <p class="text-muted text-xs">The preview updates as you type. Nothing changes for anyone else until you save.</p>
          </aside>
        </UForm>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'
import { contactFields, privacyFields, type PrivacyField } from '#shared/people'
import { MEMBER_VIEW, presentPerson, STAFF_VIEW } from '#shared/privacy'

definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
useSeoMeta({ title: 'My Profile | Lifegate Baptist Church' })

const toast = useToast()
const { data, error } = await useFetch('/api/profile')
const person = computed(() => data.value?.person ?? null)

const schema = z.object({ ...contactFields, ...privacyFields })

type FormState = { phone: string, email: string, address: string, birthday: string } & Record<PrivacyField, boolean>

const fromPerson = (p: NonNullable<typeof person.value>): FormState => ({
  phone: p.phone ?? '',
  email: p.email ?? '',
  address: p.address ?? '',
  birthday: p.birthday ?? '',
  sharePhone: p.sharePhone,
  shareEmail: p.shareEmail,
  shareAddress: p.shareAddress,
  shareBirthday: p.shareBirthday,
  sharePhoto: p.sharePhoto,
  shareHousehold: p.shareHousehold,
})

const state = reactive<FormState>(person.value
  ? fromPerson(person.value)
  : { phone: '', email: '', address: '', birthday: '', sharePhone: false, shareEmail: false, shareAddress: false, shareBirthday: false, sharePhoto: false, shareHousehold: false })

const reset = () => {
  if (person.value) Object.assign(state, fromPerson(person.value))
}

const dirty = computed(() =>
  person.value !== null && JSON.stringify(fromPerson(person.value)) !== JSON.stringify({ ...state }),
)

const sharingRows: Array<{ key: Exclude<PrivacyField, 'sharePhoto'>, label: string, note: string }> = [
  { key: 'sharePhone', label: 'Phone', note: 'Staff always see this. Turn on to show other members.' },
  { key: 'shareEmail', label: 'Email', note: 'Staff always see this. Turn on to show other members.' },
  { key: 'shareAddress', label: 'Address', note: 'Staff always see this. Turn on to show other members.' },
  { key: 'shareBirthday', label: 'Birthday', note: 'Month and day only. Hidden from everyone, staff included, unless on.' },
  { key: 'shareHousehold', label: 'Household', note: 'Hidden from everyone, staff included, unless on.' },
]

// The same rules the server applies, run on what is typed right now.
const previewRecord = computed(() => person.value && {
  ...person.value,
  ...state,
  phone: state.phone || null,
  email: state.email || null,
  address: state.address || null,
  birthday: state.birthday || null,
})
const memberPreview = computed(() => previewRecord.value && presentPerson(previewRecord.value, MEMBER_VIEW))
const staffPreview = computed(() => previewRecord.value && presentPerson(previewRecord.value, STAFF_VIEW))

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    const result = await $fetch('/api/profile', { method: 'PATCH', body: { ...state } })
    data.value = result
    reset()
    toast.add({ title: 'Your profile is saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch {
    toast.add({ title: 'Your changes were not saved', description: 'Please check the form and try again.', color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = false
  }
}
</script>
