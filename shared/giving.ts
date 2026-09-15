// Giving validation and view shapes: offerings, giving records and statements.
// Amounts are integer cents (see shared/money.ts); the server enforces.
import { z } from 'zod'

export const GIFT_METHODS = ['cash', 'check', 'online', 'bankTransfer', 'other'] as const
export type GiftMethod = typeof GIFT_METHODS[number]
export const GIFT_METHOD_LABELS: Record<GiftMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  online: 'Online',
  bankTransfer: 'Bank transfer',
  other: 'Other',
}

export const GIVER_DELIVERY = ['email', 'mail'] as const
export type GiverDelivery = typeof GIVER_DELIVERY[number]

// A gift with no budget category is undesignated: it goes to Available to Fund.
// A designated gift names the category it was given for.
export const UNDESIGNATED_LABEL = 'Undesignated'

// Fixed wording for the IRS written acknowledgment; not editable.
export const IRS_ACKNOWLEDGMENT = 'No goods or services were provided in exchange for these contributions other than intangible religious benefits.'

export const yearSchema = z.coerce.number().int().min(2000).max(2100)

// ---- Input ------------------------------------------------------------------

const name = (label: string) => z.string().trim().min(1, `Enter ${label}`).max(120)
const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).nullable()
const positiveCents = z.number().int('Use whole cents').positive('Enter an amount').refine(Number.isSafeInteger, 'Amount is too large')
const sheetCents = z.number().int('Use whole cents').min(0).refine(Number.isSafeInteger, 'Amount is too large')

export const giverSchema = z.object({
  statementName: name('the name for statements'),
  householdId: z.string().min(1).nullable(),
  personId: z.string().min(1).nullable(),
  mailingAddress: optionalText(300),
  email: z.email('Enter a valid email').max(200).nullable(),
  delivery: z.enum(GIVER_DELIVERY),
  notes: optionalText(1000),
}).superRefine((giver, ctx) => {
  if (giver.householdId && giver.personId) {
    ctx.addIssue({ code: 'custom', path: ['personId'], message: 'Link a household or a person, not both' })
  }
  if (giver.delivery === 'email' && !giver.email) {
    ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter an email to send statements by email' })
  }
})

export type GiverInput = z.infer<typeof giverSchema>

export const giverUpdateSchema = z.object({
  giver: giverSchema.optional(),
  archived: z.boolean().optional(),
})

// Counters add a giver by name; the Treasurer completes the record.
export const quickGiverSchema = z.object({ statementName: name('a name') })

export const giverSearchSchema = z.object({ q: z.string().trim().max(120).default('') })

export const countSchema = z.object({
  countedOn: z.iso.date('Enter the date'),
  label: optionalText(80),
  expectedCashCents: sheetCents,
  expectedCheckCents: sheetCents,
  counterNames: optionalText(200),
  notes: optionalText(1000),
})

export const countUpdateSchema = countSchema.partial()

export const countsQuerySchema = z.object({
  year: yearSchema.optional(),
})

// One gift, possibly split: each line becomes a gift. A line with no category
// is undesignated.
export const giftSchema = z.object({
  giverId: z.string().min(1).nullable(),
  method: z.enum(GIFT_METHODS),
  checkNumber: optionalText(30),
  // The count's date when null.
  receivedOn: z.iso.date().nullable(),
  lines: z.array(z.object({
    categoryId: z.string().min(1).nullable(),
    amountCents: positiveCents,
    // Designated lines only: what it is for when the category doesn't say.
    memo: optionalText(200).default(null),
  })).min(1, 'Add an amount').max(10),
})

export type GiftInput = z.infer<typeof giftSchema>

export const giftUpdateSchema = z.object({
  giverId: z.string().min(1).nullable(),
  categoryId: z.string().min(1).nullable(),
  method: z.enum(GIFT_METHODS),
  checkNumber: optionalText(30),
  receivedOn: z.iso.date('Enter the date'),
  amountCents: positiveCents,
  memo: optionalText(200).default(null),
})

export const reopenCountSchema = z.object({
  note: z.string().trim().min(3, 'Say why the count is being reopened').max(300),
})

export const linkDepositSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('link'), transactionId: z.string().min(1) }),
  // A manual cash account (e.g. the cash box): the deposit is entered here.
  z.object({ mode: z.literal('record'), accountId: z.string().min(1, 'Choose an account'), postedOn: z.iso.date('Enter the date') }),
])

export const statementSettingsSchema = z.object({
  legalName: name('the church’s legal name'),
  mailingAddress: optionalText(300),
  ein: z.string().trim().regex(/^\d{2}-?\d{7}$/, 'Use the form 12-3456789').nullable(),
  signerName: optionalText(120),
  signerTitle: optionalText(120),
  closingMessage: optionalText(1000),
  emailSubject: optionalText(150),
})

export type StatementSettingsInput = z.infer<typeof statementSettingsSchema>

export const statementGiversSchema = z.object({
  giverIds: z.array(z.string().min(1)).max(2000).optional(),
})

export const printQuerySchema = z.object({
  // Comma-separated; mailed givers when absent.
  giverIds: z.string().max(80_000).optional(),
})

// ---- Views ------------------------------------------------------------------

// Budget categories a gift can be designated for, by group. Names only.
export interface DesignationGroup {
  id: string
  name: string
  categories: Array<{ id: string, name: string }>
}

// All a Counter sees of a giver.
export interface GiverSearchResult {
  id: string
  statementName: string
}

export interface GiverView {
  id: string
  statementName: string
  householdId: string | null
  householdName: string | null
  personId: string | null
  personName: string | null
  mailingAddress: string | null
  email: string | null
  delivery: GiverDelivery
  notes: string | null
  archivedAt: string | null
  yearTotalCents: number
}

export interface GiverHistoryGift {
  id: string
  countId: string
  receivedOn: string
  givenTo: string
  memo: string | null
  method: GiftMethod
  checkNumber: string | null
  amountCents: number
  countClosed: boolean
}

export interface GiverDetail extends GiverView {
  gifts: GiverHistoryGift[]
}

export interface GiftView {
  id: string
  giverId: string | null
  giverName: string | null
  // Null when undesignated. givenTo is the category's name, or UNDESIGNATED_LABEL.
  categoryId: string | null
  givenTo: string
  memo: string | null
  method: GiftMethod
  checkNumber: string | null
  receivedOn: string
  amountCents: number
}

export interface CountTotals {
  cashCents: number
  checkCents: number
  otherCents: number
  totalCents: number
  // Undesignated first (categoryId null, for Available to Fund), then each designated category.
  byCategory: Array<{ categoryId: string | null, givenTo: string, amountCents: number }>
}

export interface CountSummary {
  id: string
  countedOn: string
  label: string | null
  status: 'open' | 'closed'
  giftCount: number
  // Only for people who can view giving.
  totalCents?: number
  depositLinked: boolean
}

export interface CountView {
  id: string
  countedOn: string
  label: string | null
  status: 'open' | 'closed'
  expectedCashCents: number
  expectedCheckCents: number
  counterNames: string | null
  notes: string | null
  closedAt: string | null
  // Cash and checks both match the count sheet.
  balanced: boolean
  deposit: { transactionId: string, accountName: string, postedOn: string } | null
  gifts: GiftView[]
  totals: CountTotals
}

export interface DepositCandidate {
  id: string
  accountName: string
  postedOn: string
  amountCents: number
  description: string | null
}

export interface StatementGift {
  receivedOn: string
  givenTo: string
  method: GiftMethod
  checkNumber: string | null
  amountCents: number
}

export interface StatementView {
  year: number
  giver: { id: string, statementName: string, mailingAddress: string | null, email: string | null }
  gifts: StatementGift[]
  // Undesignated first, then each designated category.
  designations: Array<{ givenTo: string, amountCents: number }>
  totalCents: number
}

export interface StatementRow {
  giverId: string
  statementName: string
  delivery: GiverDelivery
  email: string | null
  hasAddress: boolean
  archived: boolean
  giftCount: number
  totalCents: number
  lastDelivery: { method: 'email' | 'print', status: 'sent' | 'failed', at: string, error: string | null } | null
  // The total differs from the last statement that went out.
  changedSinceSent: boolean
}

export interface StatementListView {
  year: number
  rows: StatementRow[]
  // Counts in the year still open; their gifts are not on statements yet.
  openCounts: number
}

export interface StatementSettingsView extends StatementSettingsInput {
  updatedAt: string
}

export interface SendStatementsResult {
  sent: number
  failed: Array<{ giverId: string, statementName: string, error: string }>
  skipped: number
}
