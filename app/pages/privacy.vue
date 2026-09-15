<template>
  <div>
    <section class="bg-primary-800 py-16 px-6">
      <div class="max-w-4xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Lifegate Baptist Church</p>
        <h1 class="text-5xl font-bold font-serif text-white leading-[1.05]">Privacy Policy</h1>
        <p class="text-white/70 text-sm mt-4">Last updated {{ LEGAL_UPDATED }}</p>
      </div>
    </section>

    <section class="bg-default py-14 px-6">
      <div class="max-w-3xl mx-auto space-y-10 text-toned leading-relaxed">
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-shield-check"
          title="In short"
          description="We collect what the church needs to care for its people and keep its records. Your contact details are not shared with other members unless you choose to share them. We do not sell or rent information, show ads or use tracking or analytics services."
        />

        <section v-for="section in sections" :id="section.id" :key="section.id" class="space-y-3">
          <h2 class="text-2xl font-bold font-serif text-highlighted">{{ section.title }}</h2>
          <p v-for="(paragraph, i) in section.paragraphs" :key="i">{{ paragraph }}</p>
          <ul v-if="section.items" class="list-disc pl-6 space-y-1.5">
            <li v-for="(item, i) in section.items" :key="i">{{ item }}</li>
          </ul>
        </section>

        <p class="text-sm">See also our <NuxtLink to="/terms" class="text-primary font-semibold hover:underline">Terms of Use</NuxtLink>.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' })
useSeoMeta({
  title: 'Privacy Policy | Lifegate Baptist Church',
  description: 'How Lifegate Baptist Church collects, uses and protects information on its website.',
})

const sections: Array<{ id: string, title: string, paragraphs: string[], items?: string[] }> = [
  {
    id: 'who',
    title: 'Who we are',
    paragraphs: [
      `This policy covers the Lifegate Baptist Church website (lifegate.bible), run by Lifegate Baptist Church, Eau Claire, Michigan. Questions or requests about your information can be sent to ${LEGAL_CONTACT_EMAIL}.`,
    ],
  },
  {
    id: 'public',
    title: 'Visiting the public site',
    paragraphs: [
      'You can read the public pages without an account. We do not use analytics, advertising or tracking cookies, and our fonts are served from our own site.',
      'Like any web server, ours and Cloudflare (which carries traffic to it and protects it from attacks) handle technical information such as your IP address and browser type to deliver pages securely.',
      'Teaching videos are hosted on YouTube. Nothing loads from YouTube until you press play, and the player uses YouTube’s privacy-enhanced mode. Once you play a video, YouTube’s own privacy policy applies to that video.',
      'Live meetings are held on Google Meet or YouTube Live. A Google Meet opens on Google’s own site when you choose to join, and YouTube Live plays only when you press play; Google’s privacy policy applies there.',
    ],
  },
  {
    id: 'accounts',
    title: 'Member accounts',
    paragraphs: [
      'Accounts are created by the church, not by open sign-up. For an account we keep your name, email address and a securely hashed password (never the password itself).',
      'When you sign in we set one cookie to keep you signed in. Your sessions record the IP address and browser used, and we record when you sign in, so accounts can be protected and misuse noticed. Sign-in links and password reset emails are sent to your email address.',
    ],
  },
  {
    id: 'directory',
    title: 'The church directory',
    paragraphs: [
      'The church keeps a directory of its people, which can include names, household, church office or title, phone, email, mailing address, birthday, photo and the ministries you serve in. Much of this is entered by the church office; you can review and update your own details on your profile.',
      'Your own sharing choices decide what other members see:',
    ],
    items: [
      'Phone, email, address, birthday, photo and household are not shown to other members unless you choose to share them.',
      'Church staff who keep the directory can see phone, email and address to care for the congregation. Birthday and photo stay private to staff too unless you share them.',
      'Children are never listed to other members.',
      'For each ministry, you choose whether members, and separately the public, see you on its roster.',
      'Missionary information is for members only and is never public, because being identified can put missionaries at risk.',
    ],
  },
  {
    id: 'giving',
    title: 'Giving and church finances',
    paragraphs: [
      'When you give, the church records the gift, its date and amount, how it was given, and anything it was designated for, together with a giving record holding the name, mailing address and email your contribution statements go to. This is needed to provide the written acknowledgment the IRS requires for tax-deductible gifts.',
      'Giving records are seen only by the Treasurer and, while counting an offering, by the counters entering it. They are not visible to website administrators, pastors or other members. Contribution statements are emailed or mailed to you.',
      'The church’s own bank accounts are connected read-only through SimpleFIN Bridge so the budget can be kept. Payments made to help people in need are restricted so that those helped are not named to ministries or anyone who does not keep the books.',
    ],
  },
  {
    id: 'teaching',
    title: 'Teaching, ministries and other features',
    paragraphs: [
      'If you teach or preach, messages that name you are linked to your directory record, and you can edit their details. Ministry leaders may see budget totals or transactions for their ministry’s categories when the church grants it; they never see individual giving.',
      'If you contact the church or apply for a position through the site, we keep what you send so we can respond.',
    ],
  },
  {
    id: 'use',
    title: 'How we use information',
    paragraphs: ['We use information only to run the church and this website:'],
    items: [
      'to care for and communicate with the congregation;',
      'to let members find and contact one another as each person allows;',
      'to organize ministries, teaching and missions support;',
      'to keep the church’s financial records and issue contribution statements;',
      'to keep the site secure, including a record of who changed what (the record notes which details changed, not their contents).',
    ],
  },
  {
    id: 'sharing',
    title: 'Who we share it with',
    paragraphs: [
      'We do not sell, rent or trade personal information. We share it only with services that help run the site on our behalf, and only as needed:',
    ],
    items: [
      'Cloudflare, which carries traffic to our server and sends email for us;',
      'SimpleFIN Bridge, for read-only access to the church’s bank accounts;',
      'Google (YouTube and Google Meet), only when you choose to play a video or join a live meeting.',
    ],
  },
  {
    id: 'storage',
    title: 'Where it is kept and for how long',
    paragraphs: [
      'The website and its database run on a server owned by the church, in the United States, protected by access controls and encrypted connections. Each person in the church sees only what their role allows.',
      'We keep directory information while you are part of the church and remove it when it is no longer needed. Giving and financial records are kept as long as church record-keeping and tax law require. When a directory record is removed, giving records needed for those purposes are kept separately.',
    ],
  },
  {
    id: 'choices',
    title: 'Your choices',
    paragraphs: [
      `You can see and change your details and sharing choices on your profile at any time. To correct something you cannot change yourself, request a copy of your information, or ask us to remove it, email ${LEGAL_CONTACT_EMAIL}. Some records, such as giving records, may need to be kept for legal reasons.`,
    ],
  },
  {
    id: 'children',
    title: 'Children',
    paragraphs: [
      'Accounts are for adults. Children may appear in the directory as part of their household, added by their parents or the church office; they are never listed to other members and do not have accounts.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    paragraphs: [
      'If we change how we handle information, we will update this page and the date above, and tell members about significant changes.',
    ],
  },
]
</script>
