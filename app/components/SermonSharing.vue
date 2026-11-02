<template>
  <div class="space-y-4 text-sm">
    <UAlert
      :color="state.color"
      variant="subtle"
      :icon="state.icon"
      :title="state.title"
      :description="state.description"
    />

    <ul class="divide-y divide-default rounded-lg border border-default">
      <li class="p-3">
        <p class="font-semibold text-highlighted">Church office</p>
        <p class="text-muted">
          {{ sharing.availability.draft ? 'Not published yet' : 'Published' }} ·
          {{ visibility === 'members' ? 'for members only' : 'for everyone' }}
        </p>
      </li>

      <li class="p-3 space-y-2">
        <p class="font-semibold text-highlighted">Teacher</p>
        <URadioGroup
          v-if="canTeach"
          :model-value="sharing.teacherShare"
          :items="teacherItems"
          :disabled="busy"
          size="sm"
          @update:model-value="value => setTeacherShare(value as TeacherShare)"
        />
        <p v-else class="text-muted">{{ TEACHER_SHARE_LABELS[sharing.teacherShare] }}</p>
        <p v-if="canTeach" class="text-muted text-xs">You can narrow who sees this message, never widen what the office allows.</p>
      </li>

      <li v-for="party in HOLD_PARTIES" :key="party" class="p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="font-semibold text-highlighted">{{ PARTY_NAMES[party] }}</p>
          <p class="text-muted">{{ holdOf(party) ? `Paused ${formatPlaced(holdOf(party)!.at)}` : 'Not paused' }}</p>
        </div>
        <UButton
          v-if="holdParties.includes(party)"
          size="xs"
          :color="holdOf(party) ? 'neutral' : 'warning'"
          :variant="holdOf(party) ? 'outline' : 'soft'"
          :icon="holdOf(party) ? 'i-lucide-play' : 'i-lucide-pause'"
          :loading="busy"
          @click="toggleHold(party)"
        >
          {{ holdOf(party) ? 'Lift my pause' : 'Pause sharing' }}
        </UButton>
        <p v-else-if="holdOf(party)" class="text-muted text-xs">Only {{ PARTY_NAMES[party].toLowerCase() }} can lift this.</p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { AdminSermonView } from '#shared/sermons'
import { HOLD_PARTIES, TEACHER_SHARE_LABELS, TEACHER_SHARES, blockedSentence, type HoldParty, type SharingView, type TeacherShare } from '#shared/sermon-sharing'

// Who may share one message, and which of those controls the signed-in person has.
// Each control is its own: the teacher's choice, the pastor's pause and an administrator's
// pause. Nobody here can lift another's, and the office's settings are shown, not changed.
const props = defineProps<{
  sermonId: string
  sharing: SharingView
  visibility: 'public' | 'members'
  // The signed-in person taught this message.
  canTeach?: boolean
  // The pauses the signed-in person may place and lift.
  holdParties?: readonly HoldParty[]
}>()
const emit = defineEmits<{ changed: [sermon: AdminSermonView] }>()

const holdParties = computed(() => props.holdParties ?? [])
const toast = useToast()
const busy = ref(false)

const PARTY_NAMES: Record<HoldParty, string> = { pastor: 'Pastor', admin: 'Administrator' }
const teacherItems = TEACHER_SHARES.map(value => ({ value, label: TEACHER_SHARE_LABELS[value] }))

const holdOf = (party: HoldParty) => props.sharing.holds.find(hold => hold.party === party)
const formatPlaced = (at: string) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const state = computed(() => {
  const { audience, blockedBy, draft } = props.sharing.availability
  if (blockedBy.length) return { color: 'warning' as const, icon: 'i-lucide-pause', title: 'Not being shared', description: `${blockedSentence(blockedBy)}. It stays hidden until each of them lifts their own.` }
  if (draft) return { color: 'neutral' as const, icon: 'i-lucide-eye-off', title: 'Not published', description: 'The church office has not published this message yet.' }
  if (audience === 'members') return { color: 'info' as const, icon: 'i-lucide-lock', title: 'Members can watch', description: 'Signed-in members see this message.' }
  return { color: 'success' as const, icon: 'i-lucide-globe', title: 'Anyone can watch', description: 'This message is open to everyone.' }
})

const run = async (request: () => Promise<{ sermon: AdminSermonView }>, failure: string) => {
  busy.value = true
  try {
    emit('changed', (await request()).sermon)
  }
  catch (err) {
    toast.add({ title: failure, description: apiErrorMessage(err), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

const setTeacherShare = (share: TeacherShare) =>
  run(() => $fetch(`/api/teaching/mine/${props.sermonId}/share`, { method: 'PUT', body: { share } }), 'Not changed')

const toggleHold = (party: HoldParty) =>
  run(() => $fetch(`/api/admin/sermons/${props.sermonId}/holds/${party}`, { method: holdOf(party) ? 'DELETE' : 'PUT' }), holdOf(party) ? 'Not lifted' : 'Not paused')
</script>
