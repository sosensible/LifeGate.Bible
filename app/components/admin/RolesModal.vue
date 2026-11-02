<template>
  <UModal v-model:open="open" title="Roles" description="An account can hold several roles; it gets everything each one allows. Roles are defined in the site’s code, so adding a new kind of role is a development change." :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <UInput v-model="search" icon="i-lucide-search" placeholder="Search roles, or what they allow..." class="w-full mb-4" autofocus />

      <ul v-if="shown.length" class="space-y-3">
        <li v-for="role in shown" :key="role.role" class="rounded-lg border border-default p-4">
          <p class="font-bold text-highlighted">{{ role.label }}</p>
          <p class="text-toned text-sm mt-0.5">{{ role.description }}</p>
          <!-- What it allows, only when asked for. A search that matches a permission opens it. -->
          <UCollapsible v-if="role.permissions.length" v-model:open="expanded[role.role]" class="mt-2">
            <UButton variant="link" color="neutral" size="xs" class="p-0" :trailing-icon="expanded[role.role] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'">
              {{ expanded[role.role] ? 'Hide' : 'What it allows' }} ({{ role.permissions.length }})
            </UButton>
            <template #content>
              <ul class="flex flex-wrap gap-1 mt-2">
                <li v-for="label in role.permissions" :key="label">
                  <UBadge size="sm" variant="outline" color="neutral">{{ label }}</UBadge>
                </li>
              </ul>
            </template>
          </UCollapsible>
        </li>
      </ul>
      <p v-else class="text-muted text-sm">No role matches “{{ search }}”.</p>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ASSIGNABLE_ROLES, permissionLabels, ROLE_INFO } from '#shared/auth/role-info'

const open = defineModel<boolean>('open', { required: true })
const search = ref('')
const expanded = reactive<Record<string, boolean>>({})

const roles = ASSIGNABLE_ROLES.map(role => ({
  role,
  label: ROLE_INFO[role].label,
  description: ROLE_INFO[role].description,
  permissions: permissionLabels(role),
}))

const needle = computed(() => search.value.trim().toLowerCase())
const shown = computed(() => roles.filter(role =>
  !needle.value || [role.label, role.description, ...role.permissions].some(text => text.toLowerCase().includes(needle.value)),
))

// A search that finds a permission, and not the role itself, opens that role's list.
watch(needle, (value) => {
  for (const role of roles) {
    const byName = [role.label, role.description].some(text => text.toLowerCase().includes(value))
    expanded[role.role] = Boolean(value) && !byName && role.permissions.some(label => label.toLowerCase().includes(value))
  }
})
watch(open, (isOpen) => {
  if (isOpen) return
  search.value = ''
  for (const role of roles) expanded[role.role] = false
})
</script>
