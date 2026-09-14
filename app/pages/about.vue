<template>
  <div>
    <!-- Header -->
    <section class="bg-primary-800 py-20 px-6">
      <div class="max-w-4xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Lifegate Baptist Church</p>
        <h1 class="text-5xl sm:text-6xl font-bold font-serif text-white leading-[1.05]">About Us</h1>
        <div class="flex items-center gap-4 mt-6">
          <div class="h-0.5 w-12 bg-gold-500 shrink-0"></div>
          <span class="text-white/70 text-sm italic">Evangelical, Bible-centered, and welcoming — in rural Eau Claire, Michigan.</span>
        </div>
      </div>
    </section>

    <!-- Who We Are -->
    <section class="bg-default py-20 px-6">
      <div class="max-w-4xl mx-auto">
        <p class="text-gold-600 text-xs font-bold tracking-[0.2em] uppercase mb-4">Who We Are</p>
        <h2 class="text-4xl font-bold font-serif text-primary leading-tight mb-8">A Family of Believers</h2>
        <div class="space-y-6 text-lg text-toned leading-relaxed max-w-3xl">
          <p>
            Lifegate Baptist Church is an evangelical Bible-centered group of believers. Our current
            focus is feeding the saints through weekly worship services, providing for our missionaries
            through strong financial support and prayer, and providing social support to our members
            through fellowship and prayer.
          </p>
          <p>
            Lifegate, located in rural Eau Claire, MI, has a membership of approximately 40 individuals
            from various backgrounds. This includes many elderly members, families, homeschoolers, couples,
            and single adults. Our members engage in church activities, socializing and supporting one
            another inside and outside the church. Our weekly services are characterized by Bible preaching,
            monthly communion, and singing traditional hymns. We are a friendly church with the gift of
            hospitality. Our joyful spirit compels us to welcome anyone who wants to hear the Gospel message
            and join us in worship.
          </p>
        </div>
      </div>
    </section>

    <!-- Our Vision -->
    <section class="bg-parchment-900 py-20 px-6">
      <div class="max-w-4xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Our Vision</p>
        <h2 class="text-4xl font-bold font-serif text-white leading-tight mb-8">Preaching God's Word for Generations</h2>
        <div class="space-y-6 text-lg text-parchment-100 leading-relaxed max-w-3xl">
          <p>
            Lifegate is committed to ensuring that God's Word is preached in our church for generations to
            come. We will continue to support missions and maintain our friendly and welcoming spirit.
          </p>
          <p>
            Our vision for the future includes growing our membership, expanding our outward evangelism,
            exploring community outreach and service, making improvements to our physical space and
            accessibility, offering additional services and small groups, and developing engaging
            programming for our teens and young adults.
          </p>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="bg-secondary-900 py-16 px-6 text-center">
      <div class="max-w-2xl mx-auto">
        <h2 class="text-3xl font-bold font-serif text-white mb-4">Come Worship With Us</h2>
        <p class="text-secondary-200 mb-8">Sunday School 10:00 AM · Worship 11:00 AM · Wednesday Prayer &amp; Study 6:30 PM</p>
        <UButton to="/" size="xl" class="bg-gold-500 text-highlighted hover:bg-gold-600 uppercase tracking-wide font-bold">Plan Your Visit</UButton>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
})
</script>
