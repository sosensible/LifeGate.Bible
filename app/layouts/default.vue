<template>
  <div class="min-h-screen flex flex-col">
    <nav class="sticky top-0 z-50 bg-primary-800 shadow-md">
      <div class="max-w-5xl mx-auto px-6 h-[70px] flex items-center justify-between">
        <div class="text-white font-serif font-bold text-xl">Lifegate Baptist Church</div>
        <div class="flex items-center gap-4">
          <template v-if="auth.isAuthenticated">
            <UButton @click="navigateTo('/sermons')" variant="ghost" class="text-white hover:bg-white/10">Sermons</UButton>
            <UButton @click="navigateTo('/calendar')" variant="ghost" class="text-white hover:bg-white/10">Calendar</UButton>
            <UButton @click="navigateTo('/directory')" variant="ghost" class="text-white hover:bg-white/10">Directory</UButton>
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
