<template>
  <div>
    <!-- Hero -->
    <section class="bg-muted py-24 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-primary text-xs font-bold tracking-[0.2em] uppercase mb-4">Eau Claire, Michigan</p>
        <h1 class="text-5xl sm:text-6xl md:text-7xl font-bold font-serif text-highlighted leading-[1.05] mb-6">
          Where Life<br>Meets <span class="text-secondary italic">the Word.</span>
        </h1>
        <div class="flex items-center gap-4 mb-6">
          <div class="h-0.5 w-12 bg-gold-500 shrink-0"></div>
          <span class="text-toned text-sm italic">"I am the way, the truth, and the life." — John 14:6</span>
        </div>
        <p class="text-lg text-toned leading-relaxed max-w-xl mb-9">
          A Baptist church family in Eau Claire, Michigan — gathering in faith, friendship, and the love of Scripture.
        </p>
        <div class="flex gap-4 flex-wrap">
          <UButton color="primary" size="xl" class="uppercase tracking-wide font-bold">Plan Your Visit</UButton>
          <UButton color="secondary" variant="outline" size="xl" class="uppercase tracking-wide font-bold" @click="navigateTo('/login')">Member Login</UButton>
        </div>
      </div>
    </section>

    <!-- Service times -->
    <section class="bg-secondary-900 py-8 px-6">
      <div class="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Sunday School</p>
          <p class="text-2xl font-bold font-serif text-white mb-1">10:00 AM</p>
          <p class="text-secondary-200 text-sm">All Ages</p>
        </div>
        <div class="sm:border-l sm:border-r border-white/15">
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Sunday Worship</p>
          <p class="text-2xl font-bold font-serif text-white mb-1">11:00 AM</p>
          <p class="text-secondary-200 text-sm">Main Service</p>
        </div>
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Wednesday Evening</p>
          <p class="text-2xl font-bold font-serif text-white mb-1">6:30 PM</p>
          <p class="text-secondary-200 text-sm">Prayer &amp; Study</p>
        </div>
      </div>
    </section>

    <!-- About -->
    <section class="bg-default py-20 px-6">
      <div class="max-w-5xl mx-auto flex flex-col md:flex-row gap-16 items-center">
        <div class="flex-1">
          <p class="text-gold-600 text-xs font-bold tracking-[0.2em] uppercase mb-4">Who We Are</p>
          <h2 class="text-4xl font-bold font-serif text-primary leading-tight mb-5">Growing Together<br>in Grace</h2>
          <p class="text-toned leading-relaxed mb-4">
            Lifegate Baptist Church is a family of believers committed to the Word of God. We are a congregation in Eau Claire, Michigan, welcoming all who seek His truth and grace.
          </p>
          <p class="text-toned leading-relaxed mb-7">
            Whether you are new to faith or rooted in Scripture, there is a place for you here. We would love to worship alongside you.
          </p>
          <span class="text-secondary font-bold text-sm border-b-2 border-gold-500 pb-1 cursor-pointer">Learn More About Us →</span>
        </div>
        <div class="shrink-0 w-52 h-52 rounded-full border-4 border-gold-500 bg-muted flex items-center justify-center">
          <UIcon name="i-lucide-church" class="w-20 h-20 text-primary" />
        </div>
      </div>
    </section>

    <!-- Connect -->
    <section class="bg-parchment-900 py-20 px-6">
      <div class="max-w-5xl mx-auto flex flex-col md:flex-row gap-16">
        <div class="flex-1">
          <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Visit Us</p>
          <h2 class="text-4xl font-bold font-serif text-white leading-tight mb-4">We'd Love<br>to Meet You</h2>
          <p class="text-parchment-300 leading-relaxed mb-7 max-w-md">
            Come as you are. Our doors are open to everyone seeking truth, community, and grace. No prerequisites — just come.
          </p>
          <UButton size="lg" class="bg-gold-500 text-highlighted hover:bg-gold-600 uppercase tracking-wide font-bold">Get Directions</UButton>
        </div>
        <div class="flex-1 flex flex-col gap-7">
          <div>
            <p class="text-gold-400 text-xs font-bold tracking-[0.15em] uppercase mb-1.5">Address</p>
            <p class="text-parchment-100 leading-relaxed">Lifegate Baptist Church<br>Eau Claire, Michigan 49111</p>
          </div>
          <div>
            <p class="text-gold-400 text-xs font-bold tracking-[0.15em] uppercase mb-1.5">Contact</p>
            <p class="text-parchment-100">info@lifegate.bible</p>
          </div>
          <div>
            <p class="text-gold-400 text-xs font-bold tracking-[0.15em] uppercase mb-1.5">Service Times</p>
            <p class="text-parchment-100 leading-relaxed">
              Sun 10:00 AM — Sunday School (All Ages)<br>
              Sun 11:00 AM — Worship Service<br>
              Wed 6:30 PM — Prayer &amp; Study
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="bg-primary-900 border-t-4 border-gold-500 py-14 px-6">
      <div class="max-w-5xl mx-auto flex flex-wrap gap-12">
        <div class="max-w-xs">
          <p class="font-serif text-2xl font-bold text-white mb-3">Lifegate Baptist Church</p>
          <p class="text-white/60 text-sm font-bold leading-relaxed">Rooted in Faith.<br>Planted in Community.</p>
        </div>
        <div class="flex-1"></div>
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.15em] uppercase mb-4">Quick Links</p>
          <div class="flex flex-col gap-2.5">
            <span class="text-white/70 text-sm font-bold cursor-pointer hover:text-white">About Us</span>
            <span class="text-white/70 text-sm font-bold cursor-pointer hover:text-white">Sermons</span>
            <span class="text-white/70 text-sm font-bold cursor-pointer hover:text-white">Connect</span>
            <span class="text-white/70 text-sm font-bold cursor-pointer hover:text-white" @click="navigateTo('/login')">Member Login</span>
          </div>
        </div>
        <div>
          <p class="text-gold-400 text-xs font-bold tracking-[0.15em] uppercase mb-4">Contact</p>
          <div class="flex flex-col gap-2.5">
            <span class="text-white/70 text-sm font-bold">Eau Claire, Michigan 49111</span>
            <span class="text-white/70 text-sm font-bold">info@lifegatebc.org</span>
          </div>
        </div>
      </div>
      <div class="max-w-5xl mx-auto mt-8 pt-6 border-t border-white/10">
        <p class="text-white/40 text-xs font-bold">© 2026 Lifegate Baptist Church · Eau Claire, Michigan · All Rights Reserved</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const auth = useAuthStore()

onMounted(() => {
  auth.initAuth()
  if (auth.isAuthenticated) {
    navigateTo('/sermons')
  }
})
</script>
