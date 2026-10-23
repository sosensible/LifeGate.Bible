<template>
  <div class="space-y-10">
    <section v-if="data.assigned.length">
      <h2 class="text-2xl font-bold font-serif text-highlighted mb-4">
        Assigned to you
        <span class="text-muted text-base font-sans font-normal">({{ data.assigned.length }})</span>
      </h2>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="task in data.assigned" :key="task.item.id" class="px-4 sm:px-5 py-3 flex items-start gap-3">
            <UCheckbox
              class="pt-0.5"
              :model-value="false"
              :disabled="!task.item.canCheck || busy === task.item.id"
              :aria-label="`Check off ${task.item.title}`"
              @update:model-value="() => check(task)"
            />
            <div class="min-w-0 flex-1">
              <p class="text-highlighted leading-snug">{{ task.item.title }}</p>
              <p class="text-xs text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                <NuxtLink :to="`/ministries/${task.ministry.slug}`" class="hover:underline">{{ task.ministry.name }} · {{ task.list.name }}</NuxtLink>
                <span v-if="task.item.dueDate" class="inline-flex items-center gap-1" :class="{ 'text-error font-medium': task.item.overdue }">
                  <UIcon name="i-lucide-calendar" class="size-3.5" />{{ formatDue(task.item.dueDate, task.item.dueTime) }}<template v-if="task.item.overdue"> · overdue</template>
                </span>
              </p>
            </div>
          </li>
        </ul>
      </UCard>
    </section>

    <section v-for="ministry in data.ministries" :key="ministry.slug">
      <h2 class="text-2xl font-bold font-serif text-highlighted mb-4">
        <NuxtLink :to="`/ministries/${ministry.slug}`" class="hover:underline">{{ ministry.name }}</NuxtLink>
      </h2>
      <MinistryListGrid :lists="ministry.lists" :manage="false" @changed="emit('changed')" />
    </section>

    <p v-if="data.ministries.some(m => m.lists.some(l => l.canManage))" class="text-sm text-muted">
      To start a list, give out a task or change who can see one, open the ministry’s page.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { AssignedTaskView, MyListsPayload } from '#shared/ministry-lists'

defineProps<{ data: MyListsPayload }>()
const emit = defineEmits<{ changed: [] }>()

// Ticking one off here is the same check as on the ministry's page.
const toast = useToast()
const busy = ref<string | null>(null)
const check = async (task: AssignedTaskView) => {
  busy.value = task.item.id
  try {
    await $fetch(`/api/ministry-lists/${task.list.id}/items/${task.item.id}/check`, { method: 'POST', body: { done: true } })
    emit('changed')
  }
  catch (e) {
    toast.add({ title: 'Could not update that', description: apiErrorMessage(e), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    busy.value = null
  }
}
</script>
