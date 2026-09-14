<template>
  <div class="min-h-screen flex flex-col">
    <nav class="sticky top-0 z-50 bg-primary-800 shadow-md">
      <div class="max-w-5xl mx-auto px-6 h-[70px] flex items-center justify-between">
        <NuxtLink to="/" aria-label="Lifegate Baptist Church - home">
          <img src="/logo.png" alt="Lifegate Baptist Church" class="h-12 w-auto [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.95))_drop-shadow(0_0_3px_rgba(255,255,255,0.8))_drop-shadow(0_0_6px_rgba(255,255,255,0.5))]" />
        </NuxtLink>
        <div class="flex items-center gap-4">
          <UButton to="/about" variant="ghost" class="text-white hover:bg-white/10">About</UButton>
          <template v-if="auth.isAuthenticated">
            <UButton to="/teaching" variant="ghost" class="text-white hover:bg-white/10">Teaching</UButton>
            <UButton to="/calendar" variant="ghost" class="text-white hover:bg-white/10">Calendar</UButton>
            <UButton to="/directory" variant="ghost" class="text-white hover:bg-white/10">Directory</UButton>
            <UButton to="/ministries" variant="ghost" class="text-white hover:bg-white/10">Ministries</UButton>
            <UButton to="/members" size="sm" color="secondary">Members</UButton>
            <UButton @click="handleLogout" variant="outline" size="sm" class="text-white ring-white/40 hover:bg-white/10">Sign Out</UButton>
          </template>
          <UButton v-else to="/login" size="sm" color="secondary">Member Login</UButton>
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
