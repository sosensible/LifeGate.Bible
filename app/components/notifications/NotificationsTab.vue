<template>
  <div>
  <div class="space-y-12">
    <!-- Recent -->
    <section>
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 class="text-2xl font-bold font-serif text-highlighted">Recent</h2>
          <p v-if="log" class="text-sm text-muted mt-1">Kept for {{ log.keepDays }} days. Only you can see this.</p>
        </div>
        <div class="flex items-center gap-2">
          <UButton v-if="log?.unread" size="sm" variant="outline" color="neutral" icon="i-lucide-check-check" :loading="marking" @click="markAllRead">Mark all read</UButton>
          <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-settings" aria-label="Choose what you receive" @click="settingsOpen = true" />
        </div>
      </div>

      <UAlert v-if="logError" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(logError, 'Your notifications could not be loaded. They need a connection.')" />

      <UEmpty v-else-if="log && !log.notifications.length" icon="i-lucide-bell" title="Nothing yet" description="Messages from your ministries, and notices about tasks given to you, will appear here." />

      <UCard v-else-if="log" :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="item in log.notifications" :key="item.id">
            <button type="button" class="w-full text-left px-4 sm:px-5 py-3.5 flex items-start gap-3 hover:bg-elevated/60 transition-colors" @click="open(item)">
              <span class="mt-2 size-2 rounded-full shrink-0" :class="item.read ? 'bg-transparent' : 'bg-primary'" :aria-label="item.read ? undefined : 'Unread'" />
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span class="leading-snug" :class="item.read ? 'text-toned' : 'font-semibold text-highlighted'">{{ item.title }}</span>
                  <span class="text-xs text-muted">{{ formatRelative(item.at) }}</span>
                </span>
                <span class="block text-sm text-toned mt-0.5">{{ item.body }}</span>
                <span class="block text-xs text-muted mt-1">{{ item.from }}</span>
              </span>
            </button>
          </li>
        </ul>
      </UCard>
      <USkeleton v-else class="h-24 w-full" />
    </section>

    <!-- Announcements, for the few chosen to send them -->
    <section v-if="announceChannels.length">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 class="text-2xl font-bold font-serif text-highlighted">Announcements</h2>
          <p class="text-sm text-muted mt-1">You are one of the people who can send to the whole church.</p>
        </div>
        <UButton icon="i-lucide-megaphone" @click="sendOpen = true">Send an announcement</UButton>
      </div>
      <UCard v-if="announced?.sent.length" :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="item in announced.sent" :key="item.id" class="px-4 sm:px-5 py-3">
            <div class="flex flex-wrap items-baseline justify-between gap-x-4">
              <p class="font-semibold text-highlighted leading-snug">{{ item.title }}</p>
              <p class="text-xs text-muted">{{ formatDateTime(item.at) }} · {{ item.channelName }}</p>
            </div>
            <p class="text-sm text-toned mt-0.5">{{ item.body }}</p>
            <p class="text-xs text-muted mt-1">Reached {{ item.recipients }} · read by {{ item.read }}</p>
          </li>
        </ul>
      </UCard>
      <NotificationsSendSlideover v-if="announced" v-model:open="sendOpen" :channels="announceChannels" :limit="announced.limit" :min-gap-seconds="announced.minGapSeconds" :used-today="announced.usedToday" @sent="refreshAnnounced()" />
    </section>
  </div>

  <!-- What you receive: behind the gear, so the page is just the messages. -->
  <UModal v-model:open="settingsOpen" title="What you receive" description="The channels open to you. Switch one off and its messages stop coming to you." :ui="{ content: 'max-w-lg' }">
    <template #body>
      <UAlert v-if="channelsError" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(channelsError, 'Your channels could not be loaded. They need a connection.')" />

      <div v-else-if="channels" class="space-y-6">
        <div v-for="group in groups" :key="group.key">
          <h3 class="font-serif font-bold text-lg text-highlighted mb-2">{{ group.name }}</h3>
          <ul class="divide-y divide-default rounded-lg border border-default">
            <li v-for="channel in group.channels" :key="channel.id" class="px-4 py-3 flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-highlighted leading-snug">{{ channel.name }}</p>
                <p v-if="channel.description" class="text-xs text-muted mt-0.5">{{ channel.description }}</p>
              </div>
              <USwitch :model-value="channel.following" :aria-label="`Receive ${channel.name}`" @update:model-value="follow(channel, $event)" />
            </li>
          </ul>
        </div>
        <p v-if="!groups.length" class="text-sm text-muted">No channels are open to you yet.</p>
      </div>
      <USkeleton v-else class="h-24 w-full" />
    </template>
  </UModal>
  </div>
</template>

<script setup lang="ts">
import type { ChannelView, LogPayload, NotificationView, SentPayload } from '#shared/notifications'

type MyChannel = ChannelView & { canSend: boolean }

const toast = useToast()
const settingsOpen = ref(false)

// Browser only, and under keys the page shares, so its tab can show the unread
// count. These answers are the person's own and are never stored for offline use.
const { data: log, error: logError, refresh: refreshLog } = useFetch<LogPayload>('/api/me/notifications', { key: 'my-notifications', server: false, lazy: true })
const { data: channels, error: channelsError, refresh: refreshChannels } = useFetch<{ channels: MyChannel[] }>('/api/me/channels', { key: 'my-channels', server: false, lazy: true })

// One group per ministry, and the whole church first.
const groups = computed(() => {
  const byKey = new Map<string, { key: string, name: string, channels: MyChannel[] }>()
  for (const channel of channels.value?.channels ?? []) {
    const key = channel.ministry?.slug ?? ''
    const group = byKey.get(key) ?? { key, name: channel.ministry?.name ?? 'The whole church', channels: [] }
    group.channels.push(channel)
    byKey.set(key, group)
  }
  return [...byKey.values()].sort((a, b) => (a.key === '' ? -1 : b.key === '' ? 1 : a.name.localeCompare(b.name)))
})

const open = async (item: NotificationView) => {
  if (!item.read) {
    await $fetch('/api/me/notifications/read', { method: 'POST', body: { ids: [item.id] } }).catch(() => {})
    refreshLog()
  }
  if (item.url) await navigateTo(item.url)
}

const marking = ref(false)
const markAllRead = async () => {
  marking.value = true
  try {
    await $fetch('/api/me/notifications/read', { method: 'POST', body: { all: true } })
    await refreshLog()
  }
  catch (error) {
    toast.add({ title: 'Not marked', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    marking.value = false
  }
}

const follow = async (channel: MyChannel, following: boolean) => {
  try {
    await $fetch(`/api/me/channels/${channel.id}`, { method: 'PUT', body: { following } })
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  await refreshChannels()
}

// The people chosen to announce to the whole church get a form and their sent list.
const announceChannels = computed(() => (channels.value?.channels ?? []).filter(channel => channel.canSend && !channel.ministry))
const sendOpen = ref(false)
const { data: announced, refresh: refreshAnnounced } = useFetch<SentPayload>('/api/me/announcements', { server: false, lazy: true, immediate: false })
watch(announceChannels, (list) => { if (list.length && !announced.value) refreshAnnounced() }, { immediate: true })
</script>
