<template>
  <div>
    <section class="bg-primary-800 py-16 px-6">
      <div class="max-w-4xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Lifegate Baptist Church</p>
        <h1 class="text-5xl font-bold font-serif text-white leading-[1.05]">Terms of Use</h1>
        <p class="text-white/70 text-sm mt-4">Last updated {{ LEGAL_UPDATED }}</p>
      </div>
    </section>

    <section class="bg-default py-14 px-6">
      <div class="max-w-3xl mx-auto space-y-10 text-toned leading-relaxed">
        <section v-for="section in sections" :id="section.id" :key="section.id" class="space-y-3">
          <h2 class="text-2xl font-bold font-serif text-highlighted">{{ section.title }}</h2>
          <p v-for="(paragraph, i) in section.paragraphs" :key="i">{{ paragraph }}</p>
          <ul v-if="section.items" class="list-disc pl-6 space-y-1.5">
            <li v-for="(item, i) in section.items" :key="i">{{ item }}</li>
          </ul>
        </section>

        <p class="text-sm">How we handle information is described in our <NuxtLink to="/privacy" class="text-primary font-semibold hover:underline">Privacy Policy</NuxtLink>.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' })
useSeoMeta({
  title: 'Terms of Use | Lifegate Baptist Church',
  description: 'The terms for using the Lifegate Baptist Church website and member area.',
})

const sections: Array<{ id: string, title: string, paragraphs: string[], items?: string[] }> = [
  {
    id: 'agreement',
    title: 'Using this site',
    paragraphs: [
      'This website is provided by Lifegate Baptist Church, Eau Claire, Michigan, to share our ministry and to serve our church family. By using it, or by signing in to the member area, you agree to these terms. If you do not agree, please do not use the site.',
    ],
  },
  {
    id: 'accounts',
    title: 'Member accounts',
    paragraphs: [
      'Accounts are given by the church to members and others it serves. Keep your password and sign-in links to yourself, and let us know right away if you think someone else has used your account. You are responsible for what is done with your account.',
      'The church may change what an account can see or do, or close an account, for example when someone leaves the church or these terms are not followed.',
    ],
  },
  {
    id: 'member-area',
    title: 'Care with others’ information',
    paragraphs: [
      'The member area holds personal information people have shared with the church family in trust. When you use it, you agree:',
    ],
    items: [
      'to use directory, ministry and missions information only for church fellowship and ministry;',
      'not to copy it in bulk, share it outside the church, or use it for advertising, sales, fundraising for other causes or politics;',
      'not to share missionary information publicly, which can put missionaries at risk;',
      'if your role gives you access to financial, giving or pastoral information, to keep it confidential and use it only for that role.',
    ],
  },
  {
    id: 'conduct',
    title: 'Acceptable use',
    paragraphs: ['Please do not:'],
    items: [
      'try to see information your account is not given, or get around the site’s security;',
      'post or send anything unlawful, harassing, or that misrepresents who you are;',
      'interfere with the site, overload it, or use automated tools to collect its content.',
    ],
  },
  {
    id: 'content',
    title: 'Teaching and other content',
    paragraphs: [
      'Teaching, photos and other content on this site belong to Lifegate Baptist Church or the people who created them. You are welcome to watch, read and share links to them for personal, church and non-commercial use. Please ask before republishing them.',
      'Scripture quotations are from the King James Version, which is in the public domain in the United States.',
      'If you teach and edit your own messages, or submit information to the church, you confirm it is accurate and that you may share it, and you allow the church to use it for its ministry.',
    ],
  },
  {
    id: 'giving',
    title: 'Giving',
    paragraphs: [
      'Gifts to Lifegate Baptist Church are voluntary contributions to the church’s ministry and are used at the church’s discretion, honoring designations where it can. Contribution statements reflect gifts the church has received and recorded. If you believe a statement is wrong, contact the church so it can be corrected.',
    ],
  },
  {
    id: 'links',
    title: 'Other websites',
    paragraphs: [
      'The site links to or embeds other services, such as YouTube and the websites of mission organizations. We are not responsible for their content or practices; their own terms apply.',
    ],
  },
  {
    id: 'disclaimer',
    title: 'No warranty',
    paragraphs: [
      'We work to keep the site accurate and available, but it is provided as is, without warranties of any kind. Service times, events and other details can change. To the extent the law allows, Lifegate Baptist Church is not liable for any loss or damage arising from use of the site.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes and governing law',
    paragraphs: [
      'We may update these terms; the date above shows the latest version, and continuing to use the site means you accept the changes. These terms are governed by the laws of the State of Michigan.',
      `Questions about these terms can be sent to ${LEGAL_CONTACT_EMAIL}.`,
    ],
  },
]
</script>
