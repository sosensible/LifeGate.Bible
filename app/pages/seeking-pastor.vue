<template>
  <div>
    <!-- Header -->
    <section class="bg-primary-800 py-20 px-6">
      <div class="max-w-4xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Lifegate Baptist Church</p>
        <h1 class="text-5xl sm:text-6xl font-bold font-serif text-white leading-[1.05]">Seeking Pastor</h1>
        <div class="flex items-center gap-4 mt-6">
          <div class="h-0.5 w-12 bg-gold-500 shrink-0"></div>
          <span class="text-white/70 text-sm italic">Prayerfully seeking the shepherd God has for our congregation in Eau Claire, Michigan.</span>
        </div>
      </div>
    </section>

    <!-- Whom We Are Seeking -->
    <section class="bg-default py-20 px-6">
      <div class="max-w-4xl mx-auto">
        <p class="text-gold-600 text-xs font-bold tracking-[0.2em] uppercase mb-4">Whom We Are Seeking</p>
        <h2 class="text-4xl font-bold font-serif text-primary leading-tight mb-8">Seeking a Bi-Vocational Pastor</h2>
        <div class="space-y-6 text-lg text-toned leading-relaxed max-w-3xl">
          <p>
            Our former pastor of over 20 years passed away in 2019. Since then, Lifegate has sat under
            two interim pastors provided by IMI/SOS while we seek a permanent pastor.
          </p>
          <p>
            We are seeking a pastor who is committed to preaching the Inerrant Word of God. This commitment
            includes pastoral duties such as preaching for adult Sunday School and Sunday service, possibly
            adding a Wednesday night or Sunday night service. Other pastoral responsibilities may consist of
            counseling, visitation, officiating weddings, providing funeral services, overseeing baptisms,
            and related pastoral duties. Currently, we are able to offer a part-time salary. As such, we are
            seeking a bi-vocational pastor.
          </p>
          <p>
            We welcome leadership and feel that our new pastor should have room to develop programs based on
            his callings, interests, and passions while guiding our present and future ministry within the
            scope of our church vision.
          </p>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="bg-secondary-900 py-16 px-6 text-center">
      <div class="max-w-2xl mx-auto">
        <h2 class="text-3xl font-bold font-serif text-white mb-4">Sense a Calling to Lifegate?</h2>
        <p class="text-secondary-200 mb-8">We would love to hear from you. Reach out to begin a conversation.</p>
        <UButton
          size="xl"
          class="bg-gold-500 text-highlighted hover:bg-gold-600 uppercase tracking-wide font-bold"
          :to="'mailto:info@lifegate.bible?subject=Pastoral%20Inquiry'"
        >
          Contact Us — info@lifegate.bible
        </UButton>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
})
</script>
