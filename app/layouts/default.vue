<template>
  <div class="min-h-screen flex flex-col">
    <nav class="sticky top-0 z-50 bg-[#2c583a] shadow-md">
      <div class="max-w-5xl mx-auto px-6 h-[70px] flex items-center justify-between">
        <div class="text-white font-bold text-xl">Lifegate Baptist Church</div>
        <div class="flex gap-6">
          <UButton v-if="auth.isAuthenticated" @click="navigateTo('/sermons')" variant="ghost" color="neutral">Sermons</UButton>
          <UButton v-if="auth.isAuthenticated" @click="navigateTo('/calendar')" variant="ghost" color="neutral">Calendar</UButton>
          <UButton v-if="auth.isAuthenticated" @click="navigateTo('/directory')" variant="ghost" color="neutral">Directory</UButton>
          <UButton v-if="auth.isAuthenticated" @click="handleLogout" variant="outline" size="sm" color="neutral">Sign Out</UButton>
          <UButton v-else @click="navigateTo('/login')" size="sm" color="error">Member Login</UButton>
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
