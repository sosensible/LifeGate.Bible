<template>
  <div>
    <!-- Header -->
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-6xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Members Area</p>
        <h1 class="text-4xl font-bold font-serif text-white">Ministries</h1>
      </div>
    </div>

    <!-- Grid -->
    <div class="bg-default py-10 px-6">
      <div class="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <template v-for="item in gridItems" :key="item.key">
          <!-- Ministry card -->
          <NuxtLink
            v-if="item.type === 'ministry'"
            :to="`/ministries/${item.ministry.slug}`"
            class="bg-elevated rounded-lg border border-default shadow-sm p-5 block hover:border-primary transition-colors"
          >
            <h3 class="font-serif font-bold text-lg text-highlighted mb-1.5">{{ item.ministry.name }}</h3>
            <p class="text-toned text-sm mb-3 leading-relaxed">{{ item.ministry.description }}</p>
            <p v-if="item.ministry.memberCount !== undefined" class="text-gold-600 text-[11px] uppercase tracking-wide">
              {{ item.ministry.memberCount }} {{ item.ministry.memberCount === 1 ? 'member' : 'members' }}
            </p>
          </NuxtLink>

          <!-- Scripture callout spanning the full row — soft floating text, no band -->
          <div v-else class="sm:col-span-2 lg:col-span-3 px-6 py-8 text-center">
            <blockquote class="font-serif text-base sm:text-lg text-muted italic leading-relaxed max-w-2xl mx-auto mb-2.5">
              {{ item.quote.text }}
            </blockquote>
            <p class="text-gold-600 text-xs font-bold tracking-[0.15em] uppercase">{{ item.quote.ref }}</p>
          </div>
        </template>
      </div>

      <!-- Note on shared ministry — plain left-aligned FYI, no background -->
      <div class="max-w-6xl mx-auto mt-12">
        <div class="max-w-3xl">
          <p class="text-gold-600 text-xs font-bold tracking-[0.2em] uppercase mb-3">FYI</p>
          <p class="text-muted leading-relaxed">
            These ministries exist in nearly every church — yet in many, most of them quietly fall to the
            pastor and deacons alone. When others step in to share the work, it takes nothing away from the
            calling of our pastor, deacons, and elders; it simply lets the whole body carry together what was
            never meant to rest on a few. Shared ministry is not a lighter commitment — it is a fuller one.
          </p>
          <p class="text-muted leading-relaxed mt-4">
            A gentle word, too: seeing a name beside a ministry doesn't make that person your go-to for
            getting something done. They are serving there — offering their gifts, not standing at a service
            counter. Let us honor their labor with gratitude and a willing hand, and never turn a fellow
            servant into our servant.
          </p>
        </div>
      </div>
    </div>

    <!-- Invitation to serve -->
    <section class="bg-secondary-900 py-16 px-6 text-center">
      <div class="max-w-2xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Get Involved</p>
        <h2 class="text-3xl font-bold font-serif text-white mb-4">Find Your Place to Serve</h2>
        <p class="text-secondary-200 mb-8">
          Every member has gifts to share. Whether you're drawn to worship, teaching, hospitality, or
          caring for others, there's a place for you here. Reach out and we'll help you get connected.
        </p>
        <UButton
          size="xl"
          class="bg-gold-500 text-highlighted hover:bg-gold-600 uppercase tracking-wide font-bold"
          :to="'mailto:info@lifegate.bible?subject=Serving%20at%20Lifegate'"
        >
          I'd Like to Serve
        </UButton>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// Public page. The ministry list + descriptions are open to everyone; the
// server adds member counts only for signed-in members.
definePageMeta({
  layout: 'default',
})

const { data } = await useFetch('/api/ministries')

// "One body, many members" — KJV (public domain). Interleaved between cards.
const quotes = [
  { text: '"For as the body is one, and hath many members, and all the members of that one body, being many, are one body: so also is Christ."', ref: '1 Corinthians 12:12' },
  { text: '"For as we have many members in one body, and all members have not the same office: so we, being many, are one body in Christ, and every one members one of another."', ref: 'Romans 12:4–5' },
  { text: '"Now ye are the body of Christ, and members in particular."', ref: '1 Corinthians 12:27' },
]

// One Scripture callout after every N cards, spanning the full grid row.
const CARDS_PER_QUOTE = 6
type MinistryCard = NonNullable<typeof data.value>[number] & { memberCount?: number }

const gridItems = computed(() => {
  const ministries: MinistryCard[] = data.value ?? []
  const items: Array<
    { type: 'ministry', key: string, ministry: MinistryCard }
    | { type: 'quote', key: string, quote: typeof quotes[number] }
  > = []
  let qi = 0
  ministries.forEach((ministry, i) => {
    items.push({ type: 'ministry', key: `m-${ministry.slug}`, ministry })
    const isBoundary = (i + 1) % CARDS_PER_QUOTE === 0
    const isLast = i === ministries.length - 1
    if (isBoundary && !isLast && qi < quotes.length) {
      items.push({ type: 'quote', key: `q-${qi}`, quote: quotes[qi]! })
      qi++
    }
  })
  return items
})
</script>
