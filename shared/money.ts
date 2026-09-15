// Money is integer cents everywhere it is stored or computed. These convert at
// the edges: amounts from SimpleFIN, and display. (Forms use Nuxt UI's
// UInputNumber through app/components/admin/MoneyInput.vue.)

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// 123456 -> "$1,234.56"; -500 -> "-$5.00"
export const formatCents = (cents: number) => usd.format(cents / 100)

// "1,234.56", "$12", "-3.5", "12.345" -> cents, rounding half away from zero.
// Parsed as text so no floating-point rounding creeps in. Null if not a number.
export const decimalToCents = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null
  const text = String(value).trim().replace(/[$,\s]/g, '')
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(text)
  if (!match || (!match[2] && !match[3])) return null

  const [, sign, whole = '', fraction = ''] = match
  const digits = fraction.padEnd(3, '0')
  let cents = Number(whole || '0') * 100 + Number(digits.slice(0, 2))
  if (Number(digits[2]) >= 5) cents += 1
  if (!Number.isSafeInteger(cents)) return null
  return sign === '-' && cents !== 0 ? -cents : cents
}
