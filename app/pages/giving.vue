<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-gold-500 text-xs font-bold tracking-widest uppercase mb-2">Support Our Ministry</p>
        <h1 class="text-4xl font-bold font-serif text-white">Give & Donate</h1>
      </div>
    </div>

    <div class="max-w-5xl mx-auto py-12 px-6 space-y-12">
      <!-- Giving Options -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- One-Time Gift -->
        <div class="bg-elevated rounded shadow p-8 hover:shadow-lg transition">
          <h3 class="text-2xl font-bold font-serif text-highlighted mb-3">One-Time Gift</h3>
          <p class="text-toned mb-6 text-sm leading-relaxed">Support our immediate ministry needs with a single generous gift.</p>
          <UButton @click="selectedOption = 'onetime'" class="w-full" color="primary">Give Now</UButton>
        </div>

        <!-- Monthly Giving -->
        <div class="bg-elevated rounded shadow p-8 hover:shadow-lg transition">
          <h3 class="text-2xl font-bold font-serif text-highlighted mb-3">Monthly Support</h3>
          <p class="text-toned mb-6 text-sm leading-relaxed">Join our sustaining partners with consistent monthly contributions.</p>
          <UButton @click="selectedOption = 'monthly'" class="w-full" color="primary">Set Up Monthly</UButton>
        </div>

        <!-- Pledge -->
        <div class="bg-elevated rounded shadow p-8 hover:shadow-lg transition">
          <h3 class="text-2xl font-bold font-serif text-highlighted mb-3">Capital Campaign</h3>
          <p class="text-toned mb-6 text-sm leading-relaxed">Make a pledge toward our upcoming building or special project.</p>
          <UButton @click="selectedOption = 'pledge'" class="w-full" color="primary">Make a Pledge</UButton>
        </div>
      </div>

      <!-- Giving Form -->
      <div v-if="selectedOption" class="bg-elevated rounded shadow p-8">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-2xl font-bold font-serif text-highlighted">
            {{ selectedOption === 'onetime' ? 'One-Time Gift' : selectedOption === 'monthly' ? 'Monthly Support' : 'Make a Pledge' }}
          </h3>
          <button @click="selectedOption = null" class="text-muted hover:text-toned">✕</button>
        </div>

        <form @submit.prevent="handleGift" class="space-y-4">
          <!-- Amount -->
          <div>
            <label class="block text-sm font-bold text-toned mb-3">Amount *</label>
            <div class="flex gap-2 mb-3">
              <button v-for="amt in [25, 50, 100, 250]" :key="amt" type="button" @click="giftForm.amount = amt" 
                class="flex-1 py-2 px-3 border rounded text-sm font-bold transition"
                :class="giftForm.amount === amt ? 'bg-primary text-white border-primary' : 'border-default text-highlighted hover:bg-muted'">
                ${{ amt }}
              </button>
            </div>
            <input v-model.number="giftForm.amount" type="number" placeholder="Other amount" required min="1" 
              class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
          </div>

          <!-- Giver Info -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-bold text-toned mb-2">First Name *</label>
              <input v-model="giftForm.firstName" type="text" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div>
              <label class="block text-sm font-bold text-toned mb-2">Last Name *</label>
              <input v-model="giftForm.lastName" type="text" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-bold text-toned mb-2">Email *</label>
              <input v-model="giftForm.email" type="email" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-bold text-toned mb-2">Phone</label>
              <input v-model="giftForm.phone" type="tel" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm" />
            </div>
          </div>

          <!-- Fund Selection -->
          <div>
            <label class="block text-sm font-bold text-toned mb-2">Designate Gift To *</label>
            <select v-model="giftForm.fund" required class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm">
              <option value="general">General Fund</option>
              <option value="missions">Missions & Outreach</option>
              <option value="youth">Youth Ministry</option>
              <option value="building">Building Campaign</option>
              <option value="other">Other (please specify)</option>
            </select>
          </div>

          <!-- Special Instructions -->
          <div>
            <label class="block text-sm font-bold text-toned mb-2">Special Instructions or Notes</label>
            <textarea v-model="giftForm.notes" rows="3" class="w-full px-4 py-2 bg-default text-default border border-default rounded text-sm"></textarea>
          </div>

          <!-- Recurring (if monthly) -->
          <div v-if="selectedOption === 'monthly'" class="bg-muted p-4 rounded">
            <label class="flex items-center gap-3">
              <input v-model="giftForm.autoRenew" type="checkbox" class="w-4 h-4" />
              <span class="text-sm text-highlighted font-bold">Automatically renew each month</span>
            </label>
          </div>

          <!-- Error -->
          <div v-if="giftError" class="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {{ giftError }}
          </div>

          <!-- Submit -->
          <div class="flex gap-3 pt-4 border-t border-default">
            <UButton type="submit" :loading="submitting" color="primary" class="flex-1">
              <template v-if="selectedOption === 'onetime'">Complete Gift</template>
              <template v-else-if="selectedOption === 'monthly'">Set Up Monthly</template>
              <template v-else>Submit Pledge</template>
            </UButton>
            <UButton type="button" @click="selectedOption = null" variant="outline" color="neutral">Cancel</UButton>
          </div>
        </form>
      </div>

      <!-- FAQ -->
      <div v-if="!selectedOption" class="space-y-6">
        <h3 class="text-2xl font-bold font-serif text-highlighted">Giving FAQ</h3>
        
        <div class="space-y-4">
          <div class="border-l-4 border-gold-500 pl-4 py-2">
            <h4 class="font-bold text-highlighted mb-2">Is my gift tax-deductible?</h4>
            <p class="text-toned text-sm">Yes, our church is a 501(c)(3) nonprofit. All gifts are tax-deductible. You'll receive a receipt for your records.</p>
          </div>

          <div class="border-l-4 border-gold-500 pl-4 py-2">
            <h4 class="font-bold text-highlighted mb-2">What payment methods do you accept?</h4>
            <p class="text-toned text-sm">We accept credit cards, debit cards, and bank transfers. All transactions are secure and encrypted.</p>
          </div>

          <div class="border-l-4 border-gold-500 pl-4 py-2">
            <h4 class="font-bold text-highlighted mb-2">Can I give anonymously?</h4>
            <p class="text-toned text-sm">Yes. While we'd love to thank you personally, you can opt to remain anonymous during the giving process.</p>
          </div>

          <div class="border-l-4 border-gold-500 pl-4 py-2">
            <h4 class="font-bold text-highlighted mb-2">How is my gift used?</h4>
            <p class="text-toned text-sm">Gifts to the General Fund support ministry operations, staff, and outreach. Designated gifts go directly to the specified ministry area.</p>
          </div>
        </div>
      </div>

      <!-- Other Ways to Give -->
      <div class="bg-muted rounded p-8">
        <h3 class="text-2xl font-bold font-serif text-highlighted mb-4">Other Ways to Give</h3>
        <ul class="space-y-2 text-toned text-sm">
          <li>• <strong>Check:</strong> Mail to our office address</li>
          <li>• <strong>Wire Transfer:</strong> Contact the office for banking details</li>
          <li>• <strong>Stock/Securities:</strong> Speak with our financial administrator</li>
          <li>• <strong>Estate Planning:</strong> Include us in your will or trust</li>
          <li>• <strong>Cryptocurrency:</strong> Contact us for donation address</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const selectedOption = ref(null)
const submitting = ref(false)
const giftError = ref('')

const giftForm = reactive({
  amount: 50,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  fund: 'general',
  notes: '',
  autoRenew: false,
})

const handleGift = async () => {
  giftError.value = ''
  submitting.value = true

  try {
    const response = await $fetch('/api/giving', {
      method: 'POST',
      body: {
        ...giftForm,
        type: selectedOption.value,
      },
    })

    if (response.success) {
      // Redirect to payment processor or confirmation
      window.location.href = response.checkoutUrl || '/giving/confirmation'
    }
  }
  catch (err: any) {
    giftError.value = err.message || 'Failed to process gift'
  }
  finally {
    submitting.value = false
  }
}
</script>
