<template>
  <section v-if="data?.canManage" class="bg-default py-10 px-6">
    <div class="max-w-6xl mx-auto space-y-8">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-2xl font-bold font-serif text-highlighted">Notifications</h2>
          <p class="text-toned text-sm mt-1">Send a short message to the people serving here. They choose which channels to follow.</p>
        </div>
        <UButton icon="i-lucide-send" :disabled="!sendable.length" @click="sendOpen = true">Send a message</UButton>
      </div>

      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Notifications could not be loaded. They need a connection.')" />

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <!-- Channels -->
        <UCard :ui="{ header: 'p-4 sm:p-5', body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h3 class="font-serif font-bold text-lg text-highlighted">Channels</h3>
              <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-plus" @click="editChannel(null)">New channel</UButton>
            </div>
          </template>
          <ul class="divide-y divide-default">
            <li v-for="channel in data.channels" :key="channel.id" class="px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
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

        <!-- Tasks -->
        <UCard :ui="{ header: 'p-4 sm:p-5', body: 'p-4 sm:p-5' }">
          <template #header>
            <h3 class="font-serif font-bold text-lg text-highlighted">When someone is given a task</h3>
          </template>
          <p class="text-sm text-toned mb-4">How they are told, for this ministry. A list of tasks can choose differently when you edit it.</p>
          <URadioGroup v-model="taskNotify" :items="taskNotifyItems" @update:model-value="saveTaskNotify" />
          <p class="text-xs text-muted mt-3">The notice says a task was given, never what it is.</p>
        </UCard>
      </div>

      <!-- Who the messages can reach -->
      <UCard v-if="data.audience" :ui="{ header: 'p-4 sm:p-5', body: 'p-4 sm:p-5' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="font-serif font-bold text-lg text-highlighted">Who can receive messages</h3>
            <p class="text-sm text-toned">
              <span class="font-bold text-highlighted">{{ data.audience.reachable }}</span> of {{ data.audience.total }} people here have an account
            </p>
          </div>
        </template>
        <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
          <li v-for="person in data.audience.people" :key="person.id" class="flex items-center gap-2 text-sm" :class="person.canReceive ? 'text-toned' : 'text-muted'">
            <UIcon :name="person.canReceive ? 'i-lucide-bell' : 'i-lucide-bell-off'" class="size-4 shrink-0" :class="person.canReceive ? 'text-success' : ''" :aria-label="person.canReceive ? 'Can receive messages' : 'No account'" />
            <span class="truncate">{{ person.name }}</span>
            <UBadge v-if="person.isLeader" color="secondary" variant="subtle" size="sm">Leader</UBadge>
          </li>
        </ul>
        <p class="text-xs text-muted mt-4">
          Someone without an account cannot be sent anything here, so tell them another way. The church office connects each sign-in to a person.
          People who chose not to be listed still receive messages and are counted, but are not named.
        </p>
      </UCard>

      <!-- What has been sent -->
      <section v-if="sent">
        <h3 class="font-serif font-bold text-lg text-highlighted mb-3">Sent</h3>
        <UEmpty v-if="!sent.sent.length" icon="i-lucide-send" title="Nothing sent yet" description="Messages you send appear here, with how many people they reached." />
        <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li v-for="item in sent.sent" :key="item.id" class="px-4 sm:px-5 py-3">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p class="font-semibold text-highlighted leading-snug">{{ item.title }}</p>
                <p class="text-xs text-muted">{{ formatDateTime(item.at) }} · {{ item.channelName }}</p>
              </div>
              <p class="text-sm text-toned mt-0.5">{{ item.body }}</p>
              <p class="text-xs text-muted mt-1">Reached {{ item.recipients }} · read by {{ item.read }}</p>
            </li>
          </ul>
        </UCard>
      </section>

      <NotificationsChannelSlideover v-model:open="channelOpen" :channel="editing" :create-url="`/api/ministries/${encodeURIComponent(slug)}/channels`" patch-base="/api/ministry-channels" @saved="reload()" />
      <NotificationsSendSlideover v-if="sent" v-model:open="sendOpen" :channels="sendable" :limit="sent.limit" :min-gap-seconds="sent.minGapSeconds" :used-today="sent.usedToday" @sent="reload()" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { TASK_NOTIFY_LABELS, TASK_NOTIFY, type ChannelsPayload, type ChannelView, type SentPayload, type TaskNotify } from '#shared/notifications'

const props = defineProps<{ slug: string }>()
const toast = useToast()

// Fetched in the browser only. What a person may see or do here follows the roster,
// and these answers are never kept for reading offline.
const base = computed(() => `/api/ministries/${encodeURIComponent(props.slug)}`)
const { data, error, refresh } = useFetch<ChannelsPayload>(() => `${base.value}/channels`, { server: false, lazy: true })
const { data: sent, refresh: refreshSent } = useFetch<SentPayload>(() => `${base.value}/notifications`, { server: false, lazy: true, immediate: false })

// Only leaders get the screen, and only they may ask for what was sent.
watch(() => data.value?.canManage, (canManage) => { if (canManage) refreshSent() }, { immediate: true })
const reload = () => Promise.all([refresh(), refreshSent()])

const sendable = computed(() => (data.value?.channels ?? []).filter(channel => !channel.archived))

const taskNotifyItems = TASK_NOTIFY.map(value => ({ value, label: TASK_NOTIFY_LABELS[value] }))
const taskNotify = ref<TaskNotify>('both')
watch(() => data.value?.taskNotify, (value) => { if (value) taskNotify.value = value }, { immediate: true })

const saveTaskNotify = async (value: TaskNotify) => {
  try {
    await $fetch(`${base.value}/task-notify`, { method: 'PUT', body: { taskNotify: value } })
    toast.add({ title: 'Saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (err) {
    taskNotify.value = data.value?.taskNotify ?? 'both'
    toast.add({ title: 'Not saved', description: apiErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

const channelOpen = ref(false)
const sendOpen = ref(false)
const editing = ref<ChannelView | null>(null)
const editChannel = (channel: ChannelView | null) => {
  editing.value = channel
  channelOpen.value = true
}
</script>
