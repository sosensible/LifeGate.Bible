<template>
  <div>
    <AdminStewardshipHeader title="Giving statements">
      <div class="flex flex-wrap gap-2">
        <UButton to="/help/giving-statements" variant="outline" class="text-white ring-white/40 hover:bg-white/10" icon="i-lucide-circle-question-mark">Help</UButton>
        <UButton variant="outline" class="text-white ring-white/40 hover:bg-white/10" icon="i-lucide-settings" @click="settingsOpen = true">Statement settings</UButton>
      </div>
    </AdminStewardshipHeader>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto space-y-6">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Statements could not be loaded.')" />

        <UAlert
          v-if="list?.openCounts"
          color="warning"
          variant="subtle"
          icon="i-lucide-lock-open"
          :title="`${list.openCounts} count${list.openCounts === 1 ? ' is' : 's are'} still open for ${year}`"
          description="Gifts in open counts are not on statements until the counts are closed."
          :actions="[{ label: 'Go to offerings', to: '/admin/stewardship/offerings', color: 'warning', variant: 'outline' }]"
        />

        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="flex flex-wrap items-end gap-3">
            <USelect v-model="year" :items="yearItems" class="w-32" aria-label="Year" />
            <UInput v-model="search" icon="i-lucide-search" placeholder="Search names..." class="w-full sm:w-64" />
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              variant="outline"
              color="neutral"
              icon="i-lucide-printer"
              :disabled="!mailed.length"
              :to="`/api/admin/giving/statements/${year}/print`"
              target="_blank"
              external
              @click="afterPrint"
            >
              Print mailed statements ({{ mailed.length }})
            </UButton>
            <UButton v-if="canManage" icon="i-lucide-send" :disabled="!emailable.length" @click="confirmSend(null)">
              Email statements ({{ emailable.length }})
            </UButton>
          </div>
        </div>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <UTable :data="visible" :columns="columns" :loading="status === 'pending'" :empty="`No gifts on closed counts in ${year}.`">
            <template #name-cell="{ row }">
              <span class="text-highlighted font-semibold">{{ row.original.statementName }}</span>
              <p class="text-muted text-xs">{{ row.original.giftCount }} gift{{ row.original.giftCount === 1 ? '' : 's' }}</p>
            </template>
            <template #delivery-cell="{ row }">
              <UBadge variant="subtle" :color="deliverable(row.original) ? 'neutral' : 'warning'" :icon="row.original.delivery === 'email' ? 'i-lucide-mail' : 'i-lucide-mailbox'">
                {{ row.original.delivery === 'email' ? 'Email' : 'Mail' }}{{ deliverable(row.original) ? '' : ' · missing details' }}
              </UBadge>
            </template>
            <template #total-cell="{ row }">
              <span class="tabular-nums font-semibold">{{ formatCents(row.original.totalCents) }}</span>
            </template>
            <template #sent-cell="{ row }">
              <div class="flex flex-wrap items-center gap-1">
                <UTooltip v-if="row.original.lastDelivery" :text="row.original.lastDelivery.error ?? formatDateTime(row.original.lastDelivery.at)">
                  <UBadge variant="subtle" :color="row.original.lastDelivery.status === 'failed' ? 'error' : 'success'">
                    {{ row.original.lastDelivery.status === 'failed' ? 'Email failed' : row.original.lastDelivery.method === 'email' ? 'Emailed' : 'Printed' }}
                    {{ formatRelative(row.original.lastDelivery.at) }}
                  </UBadge>
                </UTooltip>
                <span v-else class="text-muted text-xs">Not sent</span>
                <UBadge v-if="row.original.changedSinceSent" color="warning" variant="subtle" icon="i-lucide-triangle-alert">Changed since sent</UBadge>
              </div>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-eye" :to="`/api/admin/giving/statements/${year}/${row.original.giverId}/pdf`" target="_blank" external>Preview</UButton>
                <UButton v-if="canManage && row.original.email" size="xs" variant="ghost" color="primary" icon="i-lucide-send" @click="confirmSend(row.original)">Email</UButton>
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-printer" :to="`/api/admin/giving/statements/${year}/print?giverIds=${row.original.giverId}`" target="_blank" external @click="afterPrint">Print</UButton>
              </div>
            </template>
          </UTable>
        </UCard>
      </div>
    </div>

    <!-- Send -->
    <UModal
      v-model:open="sendOpen"
      :title="sendTarget ? `Email ${sendTarget.statementName}’s statement?` : `Email ${emailable.length} statements?`"
      :description="sendTarget ? `To ${sendTarget.email}.` : `To everyone who gets their ${year} statement by email. Each gets their own PDF.`"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" @click="sendOpen = false">Cancel</UButton>
        <UButton icon="i-lucide-send" :loading="sending" @click="send">Send</UButton>
      </template>
    </UModal>

    <!-- Settings -->
    <USlideover v-model:open="settingsOpen" title="Statement settings" description="Printed at the top and bottom of every statement. The IRS wording is always included." :ui="{ content: 'max-w-xl' }">
      <template #body>
        <UForm id="settings-form" :schema="statementSettingsSchema" :state="settings" :disabled="!canManage" class="space-y-4" @submit="saveSettings">
          <UFormField label="Church legal name" name="legalName" required>
            <UInput v-model="settings.legalName" class="w-full" />
          </UFormField>
          <UFormField label="Mailing address" name="mailingAddress">
            <UTextarea v-model="settingsText.mailingAddress" :rows="3" class="w-full" />
          </UFormField>
          <UFormField label="EIN" name="ein" hint="Optional">
            <UInput v-model="settingsText.ein" placeholder="12-3456789" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Signed by" name="signerName" hint="Optional">
              <UInput v-model="settingsText.signerName" class="w-full" />
            </UFormField>
            <UFormField label="Title" name="signerTitle" hint="Optional">
              <UInput v-model="settingsText.signerTitle" placeholder="Treasurer" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Closing message" name="closingMessage" hint="Optional">
            <UTextarea v-model="settingsText.closingMessage" :rows="3" class="w-full" />
          </UFormField>
          <UFormField label="Email subject" name="emailSubject" hint="Optional">
            <UInput v-model="settingsText.emailSubject" :placeholder="`Your ${year} contribution statement from ${settings.legalName}`" class="w-full" />
          </UFormField>
          <UAlert color="neutral" variant="subtle" icon="i-lucide-scale" title="Always on statements" :description="IRS_ACKNOWLEDGMENT" />
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="settingsOpen = false">{{ canManage ? 'Cancel' : 'Close' }}</UButton>
        <UButton v-if="canManage" type="submit" form="settings-form" :loading="savingSettings">Save</UButton>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { formatCents } from '#shared/money'
import { IRS_ACKNOWLEDGMENT, statementSettingsSchema, type StatementRow, type StatementSettingsInput } from '#shared/giving'

definePageMeta({
  middleware: 'auth',
  permission: { giving: ['view'] },
  layout: 'default',
})
useSeoMeta({ title: 'Giving statements | Lifegate Baptist Church' })

const auth = useAuthStore()
const toast = useToast()
const canManage = computed(() => auth.can({ giving: ['manage'] }))

// Year-end statements are for last year until December.
const yearItems = recentYearItems()
const year = ref(new Date().getMonth() === 11 ? new Date().getFullYear() : new Date().getFullYear() - 1)

const { data: list, error, status, refresh } = await useFetch(() => `/api/admin/giving/statements/${year.value}`)
const rows = computed<StatementRow[]>(() => list.value?.rows ?? [])

const search = ref('')
const visible = computed(() => {
  const text = search.value.trim().toLowerCase()
  return rows.value.filter(r => !text || r.statementName.toLowerCase().includes(text))
})

const deliverable = (row: StatementRow) => row.delivery === 'email' ? Boolean(row.email) : row.hasAddress
// Matches the server: printed for mail delivery (or no email), emailed for email delivery with an address.
const mailed = computed(() => rows.value.filter(r => r.delivery === 'mail' || !r.email))
const emailable = computed(() => rows.value.filter(r => r.delivery === 'email' && r.email))

const columns: TableColumn<StatementRow>[] = [
  { id: 'name', header: 'Giving record' },
  { id: 'delivery', header: 'By' },
  { id: 'total', header: 'Total', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { id: 'sent', header: 'Sent' },
  { id: 'actions', header: '' },
]

// Printing records the statements as sent; show that once the PDF has opened.
const afterPrint = () => setTimeout(() => refresh(), 1500)

const sendOpen = ref(false)
const sendTarget = ref<StatementRow | null>(null)
const confirmSend = (row: StatementRow | null) => {
  sendTarget.value = row
  sendOpen.value = true
}
const sending = ref(false)
const send = async () => {
  sending.value = true
  try {
    const result = await $fetch(`/api/admin/giving/statements/${year.value}/send`, {
      method: 'POST',
      body: sendTarget.value ? { giverIds: [sendTarget.value.giverId] } : {},
    })
    sendOpen.value = false
    if (result.failed.length) {
      toast.add({
        title: `${result.sent} sent, ${result.failed.length} failed`,
        description: result.failed.map(f => `${f.statementName}: ${f.error}`).join(' · '),
        color: 'error',
        duration: 0,
      })
    }
    else {
      toast.add({ title: `${result.sent} statement${result.sent === 1 ? '' : 's'} sent`, color: 'success', icon: 'i-lucide-circle-check' })
    }
  }
  catch (err) {
    toast.add({ title: 'Statements not sent', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    sending.value = false
    await refresh()
  }
}

// Settings
const settingsOpen = ref(false)
const settings = reactive<StatementSettingsInput>({ legalName: '', mailingAddress: null, ein: null, signerName: null, signerTitle: null, closingMessage: null, emailSubject: null })
type OptionalKey = Exclude<keyof StatementSettingsInput, 'legalName'>
const settingsText = reactive(Object.fromEntries(
  (['mailingAddress', 'ein', 'signerName', 'signerTitle', 'closingMessage', 'emailSubject'] as OptionalKey[]).map(key => [key, computed({
    get: () => settings[key] ?? '',
    set: (value: string) => { settings[key] = value.trim() ? value : null },
  })]),
) as Record<OptionalKey, string>)

watch(settingsOpen, async (isOpen) => {
  if (!isOpen) return
  try {
    const { settings: current } = await $fetch('/api/admin/giving/statement-settings')
    const { updatedAt: _updatedAt, ...input } = current
    Object.assign(settings, input)
  }
  catch (err) {
    toast.add({ title: 'Settings could not be loaded', description: apiErrorMessage(err), color: 'error' })
  }
})
const savingSettings = ref(false)
const saveSettings = async () => {
  savingSettings.value = true
  try {
    await $fetch('/api/admin/giving/statement-settings', { method: 'PUT', body: { ...settings } })
    settingsOpen.value = false
    toast.add({ title: 'Settings saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (err) {
    toast.add({ title: 'Settings not saved', description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    savingSettings.value = false
  }
}
</script>
