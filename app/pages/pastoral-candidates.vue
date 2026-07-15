<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-gold-500 text-xs font-bold tracking-widest uppercase mb-2">Staff Opportunities</p>
        <h1 class="text-4xl font-bold font-serif text-white">Pastoral Candidates</h1>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6">
      <!-- Active Positions -->
      <div class="mb-12">
        <h2 class="text-3xl font-bold font-serif text-highlighted mb-8">Open Positions</h2>
        
        <div class="space-y-6">
          <div v-for="position in positions" :key="position.id" class="bg-elevated rounded shadow p-8 hover:shadow-lg transition">
              <div class="flex items-start justify-between mb-4">
                <div>
                  <h3 class="text-2xl font-bold font-serif text-highlighted">{{ position.title }}</h3>
                  <p class="text-muted text-sm mt-1">{{ position.type }}</p>
                </div>
                <span class="px-3 py-1 bg-primary text-white text-xs font-bold rounded">{{ position.status }}</span>
              </div>

              <p class="text-toned text-sm leading-relaxed mb-4">{{ position.description }}</p>

              <div class="grid grid-cols-2 gap-4 mb-6 text-sm">
                <div>
                  <p class="text-muted font-bold text-xs mb-1">START DATE</p>
                  <p class="text-highlighted">{{ position.startDate }}</p>
                </div>
                <div>
                  <p class="text-muted font-bold text-xs mb-1">EDUCATION</p>
                  <p class="text-highlighted">{{ position.education }}</p>
                </div>
              </div>

              <div class="mb-6 p-4 bg-muted rounded">
                <p class="text-highlighted font-bold text-sm mb-2">Key Responsibilities:</p>
                <ul class="text-toned text-sm space-y-1">
                  <li v-for="(resp, i) in position.responsibilities" :key="i">• {{ resp }}</li>
                </ul>
              </div>

              <UButton @click="openApplication(position)" color="primary" class="w-full">Submit Application</UButton>
            </div>
          </div>
        <div v-if="positions.length === 0" class="text-center py-12 bg-muted rounded">
          <p class="text-muted font-bold">No open positions at this time.</p>
          <p class="text-toned text-sm mt-2">Check back soon or contact us to express interest.</p>
        </div>
      </div>

      <!-- Application Form -->
      <div v-if="showApplicationForm" class="bg-elevated rounded shadow p-8 mb-12">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-2xl font-bold font-serif text-highlighted">Application: {{ selectedPosition?.title }}</h3>
          <button @click="showApplicationForm = false" class="text-muted hover:text-toned">✕</button>
        </div>

        <form @submit.prevent="handleSubmitApplication" class="space-y-4">
          <!-- Personal Info -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-bold text-toned mb-2">First Name *</label>
              <input v-model="applicationForm.firstName" type="text" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-toned mb-2">Last Name *</label>
              <input v-model="applicationForm.lastName" type="text" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-bold text-toned mb-2">Email *</label>
              <input v-model="applicationForm.email" type="email" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-bold text-toned mb-2">Phone *</label>
              <input v-model="applicationForm.phone" type="tel" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
          </div>

          <!-- Experience -->
          <div>
            <label class="block text-sm font-bold text-toned mb-2">Years of Ministry Experience *</label>
            <input v-model.number="applicationForm.yearsExperience" type="number" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
          </div>

          <div>
            <label class="block text-sm font-bold text-toned mb-2">Education & Credentials *</label>
            <textarea v-model="applicationForm.education" required rows="3" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm"></textarea>
          </div>

          <div>
            <label class="block text-sm font-bold text-toned mb-2">Ministry Statement *</label>
            <textarea v-model="applicationForm.statement" required rows="4" placeholder="Describe your calling and ministry philosophy..." class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm"></textarea>
          </div>

          <!-- Documents -->
          <div>
            <label class="block text-sm font-bold text-toned mb-2">Resume/CV *</label>
            <input type="file" accept=".pdf,.doc,.docx" required @change="(e) => applicationForm.resume = (e.target as HTMLInputElement).files?.[0]" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
          </div>

          <div>
            <label class="block text-sm font-bold text-toned mb-2">References (3+)</label>
            <textarea v-model="applicationForm.references" rows="3" placeholder="Name, Title, Email, Phone" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm"></textarea>
          </div>

          <!-- Agreement -->
          <div class="flex items-start gap-3 p-4 bg-muted rounded">
            <input v-model="applicationForm.agreed" type="checkbox" required class="w-4 h-4 mt-1" />
            <label class="text-sm text-toned">I confirm that the information provided is accurate and agree to the background check and reference verification process.</label>
          </div>

          <div v-if="appError" class="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {{ appError }}
          </div>

          <div v-if="appSuccess" class="p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
            Application submitted! We'll review and be in touch within 2-3 weeks.
          </div>

          <div class="flex gap-3">
            <UButton type="submit" :loading="submitting" color="primary" class="flex-1">Submit Application</UButton>
            <UButton type="button" @click="showApplicationForm = false" variant="outline" color="neutral">Cancel</UButton>
          </div>
        </form>
      </div>

      <!-- Info Section -->
      <div v-if="!showApplicationForm" class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="bg-muted rounded p-8">
          <h3 class="text-2xl font-bold font-serif text-highlighted mb-4">About Lifegate</h3>
          <p class="text-toned text-sm leading-relaxed">
            Lifegate Baptist Church is a growing, gospel-centered community committed to biblical teaching, vibrant worship, and compassionate outreach. We're seeking pastoral leaders who share our vision and values.
          </p>
        </div>

        <div class="bg-muted rounded p-8">
          <h3 class="text-2xl font-bold font-serif text-highlighted mb-4">Questions?</h3>
          <p class="text-toned text-sm leading-relaxed">
            Contact us at <a href="mailto:info@lifegate.bible" class="text-primary font-bold hover:underline">info@lifegate.bible</a> or call during office hours. We welcome inquiries from qualified candidates.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const showApplicationForm = ref(false)
const submitting = ref(false)
const appError = ref('')
const appSuccess = ref(false)
const selectedPosition = ref<any>(null)

const positions = ref<any[]>([
  {
    id: 1,
    title: 'Associate Pastor',
    type: 'Full-Time',
    status: 'Open',
    description: 'Seeking an Associate Pastor to lead youth ministry, small groups, and discipleship initiatives. Will partner with senior pastor on teaching and pastoral care.',
    startDate: 'January 2025',
    education: 'Master of Divinity or equivalent',
    responsibilities: [
      'Lead and develop youth ministry program (6th-12th grade)',
      'Oversee small group leaders and curriculum',
      'Participate in preaching rotation (monthly)',
      'Provide pastoral care and counseling',
      'Coordinate outreach and missions projects',
    ],
  },
  {
    id: 2,
    title: 'Worship Pastor',
    type: 'Full-Time',
    status: 'Open',
    description: 'Dynamic worship leader and musician to lead our contemporary worship services. Experience with band directing and digital worship technology required.',
    startDate: 'February 2025',
    education: 'Bachelor\'s degree (music or theology preferred)',
    responsibilities: [
      'Direct and select weekly worship sets',
      'Lead contemporary worship band',
      'Develop worship theology and discipleship',
      'Oversee sound and video technical team',
      'Coordinate special music events and productions',
    ],
  },
])

const applicationForm = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  yearsExperience: null,
  education: '',
  statement: '',
  resume: null,
  references: '',
  agreed: false,
})

const openApplication = (position: any) => {
  selectedPosition.value = position
  showApplicationForm.value = true
}

const handleSubmitApplication = async () => {
  appError.value = ''
  appSuccess.value = false
  submitting.value = true

  try {
    const formData = new FormData()
    formData.append('positionId', selectedPosition.value.id)
    formData.append('firstName', applicationForm.firstName)
    formData.append('lastName', applicationForm.lastName)
    formData.append('email', applicationForm.email)
    formData.append('phone', applicationForm.phone)
    formData.append('yearsExperience', applicationForm.yearsExperience)
    formData.append('education', applicationForm.education)
    formData.append('statement', applicationForm.statement)
    formData.append('references', applicationForm.references)

    const response = await $fetch('/api/pastoral-candidates', {
      method: 'POST',
      body: formData,
    })

    if (response.success) {
      appSuccess.value = true
      setTimeout(() => {
        showApplicationForm.value = false
        appSuccess.value = false
      }, 2000)
    }
  }
  catch (err: any) {
    appError.value = err.message || 'Failed to submit application'
  }
  finally {
    submitting.value = false
  }
}
</script>
