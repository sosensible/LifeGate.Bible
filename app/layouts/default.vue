<template>
  <div class="min-h-screen flex flex-col">
    <nav class="sticky top-0 z-50 bg-primary-800 shadow-md">
      <div class="max-w-5xl mx-auto px-6 h-[70px] flex items-center justify-between">
        <img src="/logo.png" alt="Lifegate Baptist Church" class="h-12 w-auto cursor-pointer [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.95))_drop-shadow(0_0_3px_rgba(255,255,255,0.8))_drop-shadow(0_0_6px_rgba(255,255,255,0.5))]" @click="navigateTo('/')" />
        <div class="flex items-center gap-4">
          <UButton @click="navigateTo('/about')" variant="ghost" class="text-white hover:bg-white/10">About</UButton>
          <template v-if="auth.isAuthenticated">
            <UButton @click="navigateTo('/teaching')" variant="ghost" class="text-white hover:bg-white/10">Teaching</UButton>
            <UButton @click="navigateTo('/calendar')" variant="ghost" class="text-white hover:bg-white/10">Calendar</UButton>
            <UButton @click="navigateTo('/directory')" variant="ghost" class="text-white hover:bg-white/10">Directory</UButton>
            <UButton @click="navigateTo('/ministries')" variant="ghost" class="text-white hover:bg-white/10">Ministries</UButton>
            <UButton @click="navigateTo('/members')" size="sm" color="secondary">Members</UButton>
            <UButton @click="handleLogout" variant="outline" size="sm" class="text-white ring-white/40 hover:bg-white/10">Sign Out</UButton>
          </template>
          <UButton v-else @click="navigateTo('/login')" size="sm" color="secondary">Member Login</UButton>
        </div>
      </div>
    </nav>
    <slot />
  </div>
</template>

<script setup lang="ts">
const auth = useAuthStore()

const handleLogout = () => {
  auth.logout()
  navigateTo('/')
}
</script>
