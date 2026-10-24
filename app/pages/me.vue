<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members</p>
        <h1 class="text-4xl font-bold font-serif text-white">My page</h1>
      </div>
    </div>
    <div class="bg-default py-16 px-6">
      <div class="max-w-xl mx-auto">
        <UEmpty
          icon="i-lucide-id-card"
          title="Your sign-in is not connected to a person yet"
          description="Your page shows your details, your ministries and what is waiting for you. The church office connects each sign-in to a person in the church directory. Please ask them to connect yours."
          :actions="[{ label: 'Contact the church office', to: '/contact', variant: 'outline', color: 'neutral' }]"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Your own page lives at /people/<your id>. This only finds it. If the account is
// not connected to a person, say so: nothing here guesses by name or email.
definePageMeta({ middleware: 'auth', layout: 'default' })
useSeoMeta({ title: 'My page' })

const { data } = await useFetch<{ personId: string | null }>('/api/me/person')
// The query goes with it, so /me?tab=notifications opens that tab.
const route = useRoute()
if (data.value?.personId) await navigateTo({ path: `/people/${data.value.personId}`, query: route.query }, { replace: true })
</script>
