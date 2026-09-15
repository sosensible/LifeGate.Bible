// Helpers shared by the offerings, givers and statements pages.
import { GIFT_METHOD_LABELS, GIFT_METHODS } from '#shared/giving'

export const giftMethodItems = GIFT_METHODS.map(value => ({ value, label: GIFT_METHOD_LABELS[value] }))

// Recent years for filters, newest first.
export const recentYearItems = (count = 6) => {
  const now = new Date().getFullYear()
  return Array.from({ length: count }, (_, i) => ({ label: String(now - i), value: now - i }))
}

// "Jan 3, 2027 · Sunday morning"
export const countTitle = (count: { countedOn: string, label: string | null }) =>
  [formatDueDate(count.countedOn), count.label].filter(Boolean).join(' · ')

export const todayIso = () => new Date().toLocaleDateString('en-CA')
