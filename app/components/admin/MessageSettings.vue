<template>
  <section class="space-y-8">
    <div>
      <h2 class="font-serif text-2xl font-bold text-highlighted">Messages</h2>
      <p class="text-muted text-sm mt-1">Notifications that ministry leaders and announcers send to the people they serve.</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'The message settings could not be loaded.')" />

    <UForm v-else-if="loaded" :schema="notificationSettingsSchema" :state="state" class="space-y-8" @submit="save">
      <section class="bg-elevated rounded-lg border border-default p-6 space-y-5">
        <h3 class="font-serif text-xl font-bold text-highlighted">Limits</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <UFormField label="Messages per channel, per day" name="maxPerDay" hint="So a channel cannot be used to nag">
            <UInputNumber v-model="state.maxPerDay" :min="1" :max="50" class="w-full" />
          </UFormField>
          <UFormField label="Keep notifications for (days)" name="keepDays" hint="Older ones are deleted">
            <UInputNumber v-model="state.keepDays" :min="7" :max="365" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Seconds between messages on a channel" name="minGapSeconds" hint="So they reach people in the order sent. 0 turns it off">
          <UInputNumber v-model="state.minGapSeconds" :min="0" :max="3600" class="w-full sm:w-1/2" />
        </UFormField>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <UFormField label="Quiet hours start" name="quietStart" hint="Church time">
            <UInput v-model="state.quietStart" type="time" class="w-full" />
          </UFormField>
          <UFormField label="Quiet hours end" name="quietEnd">
            <UInput v-model="state.quietEnd" type="time" class="w-full" />
          </UFormField>
        </div>
        <p class="text-muted text-xs">Quiet hours hold alerts to phones and computers until morning. They take effect when those alerts are switched on; today, messages go to each person’s Notifications.</p>
      </section>

      <section class="bg-elevated rounded-lg border border-default p-6 space-y-5">
        <div>
          <h3 class="font-serif text-xl font-bold text-highlighted">Who may announce to the whole church</h3>
          <p class="text-muted text-sm mt-1">Members with an account. Everyone else can send only to their own ministry, and only if they lead it.</p>
        </div>
        <UFormField label="Announcers" name="senderUserIds">
          <USelectMenu v-model="state.senderUserIds" :items="candidateItems" value-key="value" multiple searchable placeholder="Choose people" class="w-full" />
        </UFormField>
      </section>

      <div class="flex items-center gap-4">
        <UButton type="submit" size="lg" icon="i-lucide-save" :loading="saving">Save message settings</UButton>
      </div>
    </UForm>

    <!-- The church-wide channels -->
    <UCard v-if="loaded" :ui="{ header: 'p-4 sm:p-5', body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="font-serif font-bold text-lg text-highlighted">Whole-church channels</h3>
            <p class="text-xs text-muted mt-0.5">Every member follows these unless they switch one off.</p>
          </div>
          <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-plus" @click="editChannel(null)">New channel</UButton>
        </div>
      </template>
      <ul class="divide-y divide-default">
        <li v-for="channel in channels?.channels ?? []" :key="channel.id" class="px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-semibold text-highlighted leading-snug">
              {{ channel.name }}
              <UBadge v-if="channel.archived" color="neutral" variant="subtle" size="sm" class="ml-1.5 align-middle">Retired</UBadge>
            </p>
            <p v-if="channel.description" class="text-xs text-muted mt-0.5">{{ channel.description }}</p>
          </div>
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" :aria-label="`Edit ${channel.name}`" @click="editChannel(channel)" />
        </li>
      </ul>
    </UCard>

    <NotificationsChannelSlideover v-model:open="channelOpen" :channel="editing" create-url="/api/admin/notification-channels" patch-base="/api/admin/notification-channels" @saved="refreshChannels()" />
  </section>
</template>

<script setup lang="ts">
import { notificationSettingsSchema, type ChannelView, type NotificationSettingsInput, type NotificationSettingsView } from '#shared/notifications'

const toast = useToast()

// Browser only: these are settings for the office, never part of a public page.
const { data, error, refresh } = useFetch<NotificationSettingsView>('/api/admin/notification-settings', { server: false, lazy: true })
const { data: channels, refresh: refreshChannels } = useFetch<{ channels: ChannelView[] }>('/api/admin/notification-channels', { server: false, lazy: true })

const state = reactive<NotificationSettingsInput>({ maxPerDay: 5, keepDays: 90, minGapSeconds: 30, quietStart: '21:00', quietEnd: '07:00', senderUserIds: [] })
const loaded = computed(() => Boolean(data.value))
watch(data, (value) => {
  if (!value) return
  Object.assign(state, { maxPerDay: value.maxPerDay, keepDays: value.keepDays, minGapSeconds: value.minGapSeconds, quietStart: value.quietStart, quietEnd: value.quietEnd, senderUserIds: [...value.senderUserIds] })
}, { immediate: true })

const candidateItems = computed(() => (data.value?.candidates ?? []).map(candidate => ({ label: candidate.name, value: candidate.userId })))

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    await $fetch('/api/admin/notification-settings', { method: 'PUT', body: { ...state, senderUserIds: [...state.senderUserIds] } })
    await refresh()
    toast.add({ title: 'Message settings saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (err) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = false
  }
}

const channelOpen = ref(false)
const editing = ref<ChannelView | null>(null)
const editChannel = (channel: ChannelView | null) => {
  editing.value = channel
  channelOpen.value = true
}
</script>
