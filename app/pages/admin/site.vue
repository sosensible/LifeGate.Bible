<template>
  <div>
    <div class="bg-primary-800 py-10 px-6">
      <div class="max-w-4xl mx-auto">
        <p class="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Church Office</p>
        <h1 class="text-4xl font-bold font-serif text-white">Church details</h1>
        <p class="text-white/70 mt-2 max-w-2xl">The name, address, contact details, service times and logo that the website, its emails and the phone app show.</p>
      </div>
    </div>

    <div class="bg-default py-10 px-6">
      <div class="max-w-4xl mx-auto space-y-8">
        <!-- The logo -->
        <section class="bg-elevated rounded-lg border border-default p-6">
          <h2 class="font-serif text-xl font-bold text-highlighted mb-1">Logo</h2>
          <p class="text-muted text-sm mb-5">Choose one picture. The site makes every size it needs from it: the header, the home page, the browser tab, and the phone’s home screen.</p>

          <div class="flex flex-wrap items-start gap-6">
            <div class="space-y-1.5">
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">{{ prepared ? 'New logo' : 'Current logo' }}</p>
              <div class="bg-primary-800 rounded-lg p-4 w-56 h-32 flex items-center justify-center">
                <img v-if="prepared" :src="prepared.pageUrl" alt="New logo, as it will appear" class="max-h-full max-w-full">
                <SiteLogo v-else sizes="224px" alt="Current logo" class="max-h-full max-w-full w-auto" />
              </div>
            </div>
            <div class="space-y-1.5">
              <p class="text-gold-600 text-[10px] tracking-[0.15em] uppercase">Phone icon</p>
              <div class="flex gap-2">
                <img :src="prepared ? prepared.iconUrl : iconSrc(192)" alt="Icon" class="w-24 h-24 rounded-2xl border border-default bg-white">
                <img :src="prepared ? prepared.tabUrl : iconSrc(48)" alt="Browser tab icon" class="w-12 h-12 self-end border border-default bg-white">
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2 mt-5">
            <template v-if="prepared">
              <UButton icon="i-lucide-check" :loading="savingLogo" @click="saveLogo">Use this logo</UButton>
              <UButton variant="outline" color="neutral" :disabled="savingLogo" @click="discard">Cancel</UButton>
            </template>
            <template v-else>
              <UButton variant="outline" color="neutral" icon="i-lucide-upload" :loading="preparing" @click="picker?.click()">
                {{ site.logoVersion ? 'Replace logo' : 'Upload logo' }}
              </UButton>
              <UButton v-if="site.logoVersion" variant="ghost" color="neutral" icon="i-lucide-trash-2" :loading="removingLogo" @click="removeLogo">Remove</UButton>
            </template>
          </div>
          <p class="text-muted text-xs mt-3">A PNG, JPEG or WebP at least 864 pixels wide looks sharpest. A transparent background works well. Until one is uploaded the site shows a plain cross.</p>
          <input ref="picker" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="choose">
        </section>

        <!-- The details -->
        <UForm :schema="siteSchema" :state="state" class="space-y-8" @submit="save">
          <section class="bg-elevated rounded-lg border border-default p-6 space-y-5">
            <h2 class="font-serif text-xl font-bold text-highlighted">Name</h2>
            <UFormField label="Church name" name="name" required hint="Shown in page titles, the footer and emails">
              <UInput v-model="state.name" class="w-full" />
            </UFormField>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <UFormField label="Short name" name="shortName" required hint="Under the icon on a phone">
                <UInput v-model="state.shortName" class="w-full" />
              </UFormField>
              <UFormField label="One-line description" name="description" hint="What search engines show">
                <UInput v-model="state.description" class="w-full" />
              </UFormField>
            </div>
          </section>

          <section class="bg-elevated rounded-lg border border-default p-6 space-y-5">
            <h2 class="font-serif text-xl font-bold text-highlighted">Address and contact</h2>
            <UFormField label="Street" name="street" hint="Leave empty to show no street, and no directions button">
              <UInput v-model="state.street" autocomplete="off" class="w-full" />
            </UFormField>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <UFormField label="City" name="city"><UInput v-model="state.city" class="w-full" /></UFormField>
              <UFormField label="State or region" name="region"><UInput v-model="state.region" class="w-full" /></UFormField>
              <UFormField label="Postal code" name="postalCode"><UInput v-model="state.postalCode" class="w-full" /></UFormField>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <UFormField label="Phone" name="phone"><UInput v-model="state.phone" type="tel" class="w-full" /></UFormField>
              <UFormField label="Contact email" name="contactEmail" hint="The Contact page’s messages go here">
                <UInput v-model="state.contactEmail" type="email" class="w-full" />
              </UFormField>
            </div>
          </section>

          <section class="bg-elevated rounded-lg border border-default p-6">
            <h2 class="font-serif text-xl font-bold text-highlighted mb-1">Service times</h2>
            <p class="text-muted text-sm mb-5">
              Up to eight. They appear on the home page in this order. If the Google calendar has a service of the
              same name, its dates are followed, so a service it moves or cancels shows true. Tick
              <UIcon name="i-lucide-calendar-days" class="inline size-4 align-text-bottom" aria-hidden="true" />
              to list a service every week on the church calendar too (unless the Google calendar already has it).
            </p>

            <p v-if="!state.serviceTimes.length" class="text-muted text-sm italic mb-4">No service times yet.</p>
            <div v-for="(service, i) in state.serviceTimes" :key="i" class="grid grid-cols-2 sm:grid-cols-[7rem_7.5rem_1fr_1fr_2rem_auto] gap-3 items-start mb-3">
              <UFormField :name="`serviceTimes.${i}.weekday`" :label="i === 0 ? 'Day' : undefined">
                <USelect v-model="service.weekday" :items="weekdayItems" aria-label="Day" class="w-full" />
              </UFormField>
              <UFormField :name="`serviceTimes.${i}.time`" :label="i === 0 ? 'Time' : undefined">
                <UInput v-model="service.time" type="time" aria-label="Time" class="w-full" />
              </UFormField>
              <UFormField :name="`serviceTimes.${i}.label`" :label="i === 0 ? 'Service' : undefined">
                <UInput v-model="service.label" placeholder="Sunday Service" aria-label="Service" class="w-full" />
              </UFormField>
              <UFormField :name="`serviceTimes.${i}.note`" :label="i === 0 ? 'Note' : undefined">
                <UInput v-model="service.note" placeholder="Main Service" aria-label="Note" class="w-full" />
              </UFormField>
              <!-- The column's heading is an icon, on the first row only. -->
              <div class="flex flex-col items-center">
                <UTooltip v-if="i === 0" text="Show on the church calendar">
                  <UIcon name="i-lucide-calendar-days" class="size-5 mb-1.5 text-muted" aria-label="Show on the church calendar" />
                </UTooltip>
                <div class="h-8 flex items-center">
                  <UCheckbox v-model="service.onCalendar" aria-label="Show on the church calendar" />
                </div>
              </div>
              <UButton icon="i-lucide-trash-2" variant="ghost" color="neutral" aria-label="Remove this service" :class="i === 0 ? 'sm:mt-6' : ''" @click="state.serviceTimes.splice(i, 1)" />
            </div>
            <UButton icon="i-lucide-plus" variant="outline" color="neutral" size="sm" :disabled="state.serviceTimes.length >= 8" @click="state.serviceTimes.push({ weekday: 0, time: '10:00', label: '', note: '', onCalendar: true })">Add a service</UButton>
          </section>

          <div class="flex items-center gap-4">
            <UButton type="submit" size="lg" icon="i-lucide-save" :loading="saving">Save details</UButton>
            <p class="text-muted text-xs">Changes show on the site, in emails and in the phone app straight away.</p>
          </div>
        </UForm>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { WEEKDAYS, siteSchema, type SiteInput } from '#shared/site'
import { ICON_SIZES, LOGO_WIDTHS, iconPartName, logoPartName } from '#shared/site-logo'

definePageMeta({
  middleware: 'auth',
  permission: { siteSettings: ['update'] },
  layout: 'default',
})
useSeoMeta({ title: 'Church details' })

const toast = useToast()
const weekdayItems = WEEKDAYS.map((label, value) => ({ label, value }))
const { site, iconSrc } = useSite()

const copy = (): SiteInput => ({
  name: site.value.name,
  shortName: site.value.shortName,
  description: site.value.description,
  street: site.value.street,
  city: site.value.city,
  region: site.value.region,
  postalCode: site.value.postalCode,
  phone: site.value.phone,
  contactEmail: site.value.contactEmail,
  serviceTimes: site.value.serviceTimes.map(s => ({ ...s })),
})
const state = reactive<SiteInput>(copy())

// --- The details ---
const saving = ref(false)
const save = async (event: FormSubmitEvent<SiteInput>) => {
  saving.value = true
  try {
    await $fetch('/api/admin/site', { method: 'PUT', body: event.data })
    await refreshNuxtData('site')
    toast.add({ title: 'Church details saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    saving.value = false
  }
}

// --- The logo ---
const picker = ref<HTMLInputElement>()
const preparing = ref(false)
const savingLogo = ref(false)
const removingLogo = ref(false)

interface Prepared {
  files: Record<string, Blob>
  pageUrl: string
  iconUrl: string
  tabUrl: string
}
const prepared = ref<Prepared | null>(null)

const toPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('no image')), 'image/png'))

const drawn = (width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no canvas')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  draw(context)
  return toPng(canvas)
}

// Every size from the one picture, made here because a canvas does it well and the
// site has no image library. The page sizes keep the picture's proportions on a
// transparent background. The icons are square, with the picture fitted in the
// middle: a little air round the big ones, almost none on the tiny tab icons. The
// iPhone one is on white, because iOS fills transparency with black. Drawing it
// afresh also drops any hidden details in the original.
const makeSet = async (file: File) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const aspect = bitmap.height / bitmap.width
    if (aspect > 4 || aspect < 0.2) throw new RangeError('shape')

    const files: Record<string, Blob> = {}
    for (const width of LOGO_WIDTHS) {
      const height = Math.max(1, Math.round(width * aspect))
      files[logoPartName(width)] = await drawn(width, height, context => context.drawImage(bitmap, 0, 0, width, height))
    }
    for (const size of ICON_SIZES) {
      const air = size <= 48 ? 0.04 : 0.1
      const inner = size * (1 - 2 * air)
      const scale = Math.min(inner / bitmap.width, inner / bitmap.height)
      const w = bitmap.width * scale
      const h = bitmap.height * scale
      files[iconPartName(size)] = await drawn(size, size, (context) => {
        if (size === 180) {
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, size, size)
        }
        context.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h)
      })
    }
    return files
  }
  finally {
    bitmap.close()
  }
}

const release = () => {
  if (!prepared.value) return
  URL.revokeObjectURL(prepared.value.pageUrl)
  URL.revokeObjectURL(prepared.value.iconUrl)
  URL.revokeObjectURL(prepared.value.tabUrl)
  prepared.value = null
}
onBeforeUnmount(release)

const choose = async () => {
  const file = picker.value?.files?.[0]
  if (!file) return
  preparing.value = true
  try {
    const files = await makeSet(file)
    release()
    prepared.value = {
      files,
      pageUrl: URL.createObjectURL(files[logoPartName(432)]!),
      iconUrl: URL.createObjectURL(files[iconPartName(192)]!),
      tabUrl: URL.createObjectURL(files[iconPartName(48)]!),
    }
  }
  catch (error) {
    const unusual = error instanceof RangeError
    toast.add({
      title: 'Logo not used',
      description: unusual ? 'That picture is an unusual shape. Try one that is closer to square or a banner.' : 'This browser could not read that picture. Try a PNG or JPEG.',
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
  }
  finally {
    preparing.value = false
    if (picker.value) picker.value.value = ''
  }
}

const discard = () => release()

const saveLogo = async () => {
  if (!prepared.value) return
  savingLogo.value = true
  try {
    const body = new FormData()
    for (const [name, blob] of Object.entries(prepared.value.files)) body.append(name, blob, `${name}.png`)
    await $fetch('/api/admin/site/logo', { method: 'PUT', body })
    release()
    await refreshNuxtData('site')
    toast.add({ title: 'Logo saved', description: 'A phone that already has the app keeps its old home-screen icon until it is added again.', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (error) {
    toast.add({ title: 'Logo not saved', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    savingLogo.value = false
  }
}

const removeLogo = async () => {
  removingLogo.value = true
  try {
    await $fetch('/api/admin/site/logo', { method: 'DELETE' })
    await refreshNuxtData('site')
    toast.add({ title: 'Logo removed', color: 'success' })
  }
  catch (error) {
    toast.add({ title: 'Logo not removed', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    removingLogo.value = false
  }
}
</script>
