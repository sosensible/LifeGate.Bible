<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-gold-500 text-xs font-bold tracking-widest uppercase mb-2">Get In Touch</p>
        <h1 class="text-4xl font-bold font-serif text-white">Contact & Location</h1>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
        <!-- Contact Info -->
        <div class="space-y-8">
          <div>
            <h3 class="text-2xl font-bold font-serif text-highlighted mb-6">Contact Information</h3>
            
            <div class="space-y-6">
              <!-- Address -->
              <div class="flex gap-4">
                <div class="flex-shrink-0 w-12 h-12 bg-primary rounded flex items-center justify-center">
                  <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  </svg>
                </div>
                <div>
                  <h4 class="font-bold text-highlighted mb-1">Our Location</h4>
                  <p class="text-toned text-sm leading-relaxed">123 Faith Street<br />Springfield, IL 62701</p>
                  <a href="https://maps.google.com" target="_blank" class="text-primary hover:text-primary-900 text-xs font-bold mt-2 inline-block">View on Map →</a>
                </div>
              </div>

              <!-- Phone -->
              <div class="flex gap-4">
                <div class="flex-shrink-0 w-12 h-12 bg-primary rounded flex items-center justify-center">
                  <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                  </svg>
                </div>
                <div>
                  <h4 class="font-bold text-highlighted mb-1">Phone</h4>
                  <p class="text-toned text-sm">(217) 555-0123</p>
                  <p class="text-muted text-xs mt-1">Mon–Fri, 9am–5pm CST</p>
                </div>
              </div>

              <!-- Email -->
              <div class="flex gap-4">
                <div class="flex-shrink-0 w-12 h-12 bg-primary rounded flex items-center justify-center">
                  <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                  </svg>
                </div>
                <div>
                  <h4 class="font-bold text-highlighted mb-1">Email</h4>
                  <p class="text-toned text-sm"><a href="mailto:info@lifegate.church" class="hover:text-primary">info@lifegate.church</a></p>
                  <p class="text-muted text-xs mt-1">We'll respond within 24 hours</p>
                </div>
              </div>

              <!-- Office Hours -->
              <div class="flex gap-4">
                <div class="flex-shrink-0 w-12 h-12 bg-primary rounded flex items-center justify-center">
                  <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <div>
                  <h4 class="font-bold text-highlighted mb-1">Office Hours</h4>
                  <p class="text-toned text-sm">Monday–Friday: 9:00 AM – 5:00 PM<br />Sunday: 8:00 AM – 12:00 PM<br />Saturday: Closed</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Contact Form -->
        <div class="bg-elevated rounded shadow p-8">
          <h3 class="text-2xl font-bold font-serif text-highlighted mb-6">Send us a Message</h3>
          
          <form @submit.prevent="handleSubmit" class="space-y-4">
            <div>
              <label class="block text-sm font-bold text-toned mb-2">Name *</label>
              <input v-model="contactForm.name" type="text" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label class="block text-sm font-bold text-toned mb-2">Email *</label>
              <input v-model="contactForm.email" type="email" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label class="block text-sm font-bold text-toned mb-2">Phone</label>
              <input v-model="contactForm.phone" type="tel" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label class="block text-sm font-bold text-toned mb-2">Subject *</label>
              <select v-model="contactForm.subject" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select a subject</option>
                <option value="general">General Inquiry</option>
                <option value="prayer">Prayer Request</option>
                <option value="event">Event Question</option>
                <option value="membership">Membership</option>
                <option value="ministry">Ministry Involvement</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-bold text-toned mb-2">Message *</label>
              <textarea v-model="contactForm.message" required rows="5" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
            </div>

            <div v-if="contactError" class="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {{ contactError }}
            </div>

            <div v-if="contactSuccess" class="p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
              Thanks for reaching out! We'll be in touch soon.
            </div>

            <UButton type="submit" :loading="submitting" color="primary" class="w-full">Send Message</UButton>
          </form>
        </div>
      </div>

      <!-- Service Times -->
      <div class="bg-muted rounded p-8 mb-12">
        <h3 class="text-2xl font-bold font-serif text-highlighted mb-6">Service Times</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-elevated rounded p-4">
            <h4 class="font-bold text-highlighted mb-2">Sunday Morning</h4>
            <p class="text-toned text-sm">8:00 AM & 10:30 AM</p>
            <p class="text-muted text-xs mt-2">Main Sanctuary</p>
          </div>
          <div class="bg-elevated rounded p-4">
            <h4 class="font-bold text-highlighted mb-2">Wednesday Evening</h4>
            <p class="text-toned text-sm">7:00 PM</p>
            <p class="text-muted text-xs mt-2">Fellowship Hall</p>
          </div>
          <div class="bg-elevated rounded p-4">
            <h4 class="font-bold text-highlighted mb-2">Sunday School</h4>
            <p class="text-toned text-sm">9:15 AM</p>
            <p class="text-muted text-xs mt-2">Various Classrooms</p>
          </div>
        </div>
      </div>

      <!-- Embedded Map (placeholder) -->
      <div class="rounded overflow-hidden shadow">
        <div class="bg-accented h-96 flex items-center justify-center">
          <div class="text-center">
            <svg class="w-12 h-12 text-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
            </svg>
            <p class="text-toned font-bold mb-2">123 Faith Street, Springfield, IL 62701</p>
            <a href="https://maps.google.com" target="_blank" class="text-primary hover:text-primary-900 text-sm font-bold">Open in Google Maps →</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const submitting = ref(false)
const contactError = ref('')
const contactSuccess = ref(false)

const contactForm = reactive({
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
})

const handleSubmit = async () => {
  contactError.value = ''
  contactSuccess.value = false
  submitting.value = true

  try {
    const response = await $fetch('/api/contact', {
      method: 'POST',
      body: contactForm,
    })

    if (response.success) {
      contactSuccess.value = true
      contactForm.name = ''
      contactForm.email = ''
      contactForm.phone = ''
      contactForm.subject = ''
      contactForm.message = ''
      
      setTimeout(() => {
        contactSuccess.value = false
      }, 5000)
    }
  }
  catch (err: any) {
    contactError.value = err.message || 'Failed to send message'
  }
  finally {
    submitting.value = false
  }
}
</script>
