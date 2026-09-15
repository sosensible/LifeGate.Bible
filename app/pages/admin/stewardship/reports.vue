<template>
  <div>
    <AdminStewardshipHeader title="Reports" />

    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <!-- Placeholder until Phase 3 (semi-annual reports) is built. -->
        <UEmpty
          icon="i-lucide-file-chart-column"
          title="Semi-annual reports are coming"
          description="January–June and July–December reports, organized by category group, with funded, activity and remaining for each category. They will be viewable here and downloadable as PDF and CSV."
          :actions="[{ label: 'Set up category groups', icon: 'i-lucide-folder-tree', to: '/admin/stewardship/categories', color: 'neutral', variant: 'outline' }]"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  permission: { stewardship: ['view'] },
  layout: 'default',
})
useSeoMeta({ title: 'Reports | Lifegate Baptist Church' })
</script>
