<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">Church Calendar</h1>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6">
      <div class="bg-elevated rounded-lg shadow overflow-hidden border border-default">
        <iframe
          :src="calendarSrc"
          class="w-full h-[70vh] min-h-[600px]"
          style="border: 0"
          title="Lifegate Baptist Church calendar"
          loading="lazy"
        ></iframe>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

// Google Calendar public embed for the church calendar.
const calendarSrc
  = 'https://calendar.google.com/calendar/embed'
    + '?src=c_baaa4ccb373fea22acd9baa101b3aa2fc108c2fa04f02444c491f6332f7c6b4d%40group.calendar.google.com'
    + '&color=%237bd148'
    + '&ctz=America%2FDetroit'
</script>
