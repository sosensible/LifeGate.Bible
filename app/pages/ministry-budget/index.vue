<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Stewardship</p>
        <h1 class="text-4xl font-bold font-serif text-white">Ministry budgets</h1>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="apiErrorMessage(error, 'Ministry budgets could not be loaded.')" />
        <UEmpty
          v-else-if="!ministries.length"
          icon="i-lucide-wallet"
          title="Nothing shared with you yet"
          description="When the church shares a ministry's budget with its leaders or members, it appears here."
        />
        <UPageGrid v-else>
          <UPageCard
            v-for="ministry in ministries"
            :key="ministry.slug"
            :title="ministry.name"
            :description="`${ministry.categoryCount} ${ministry.categoryCount === 1 ? 'category' : 'categories'} shared`"
            icon="i-lucide-wallet"
            :to="`/ministry-budget/${ministry.slug}`"
          />
        </UPageGrid>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
useSeoMeta({ title: 'Ministry budgets | Lifegate Baptist Church' })

const { data, error } = await useFetch('/api/stewardship/ministries')
const ministries = computed(() => data.value?.ministries ?? [])

// One ministry: go straight to it.
if (ministries.value.length === 1) await navigateTo(`/ministry-budget/${ministries.value[0]!.slug}`, { replace: true })
</script>
