// Stewardship validation and view shapes, shared by the forms and the server
// routes. Amounts are integer cents (see shared/money.ts); the server enforces.
import { z } from 'zod'

// The system category unassigned income goes to (seeded by migration 0011).
export const AVAILABLE_TO_FUND_ID = 'available-to-fund'

export const ACCOUNT_KINDS = ['checking', 'savings', 'cash', 'credit', 'other'] as const
export type AccountKind = typeof ACCOUNT_KINDS[number]
// Their combined balance is the money the budget is funded from.
export const CASH_ACCOUNT_KINDS: readonly AccountKind[] = ['checking', 'savings', 'cash']
export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking: 'Checking',
  savings: 'Savings',
  cash: 'Cash',
  credit: 'Credit card',
  other: 'Other (not budgeted)',
}

export const MINISTRY_ACCESS_LEVELS = ['totals', 'ledger'] as const
export type MinistryAccessLevel = typeof MINISTRY_ACCESS_LEVELS[number]
export const MINISTRY_ACCESS_AUDIENCES = ['leaders', 'members'] as const
export type MinistryAccessAudience = typeof MINISTRY_ACCESS_AUDIENCES[number]

// ---- Months -----------------------------------------------------------------

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')

export const monthOf = (date: string) => date.slice(0, 7)

export const addMonths = (month: string, count: number) => {
  const [year, index] = month.split('-').map(Number) as [number, number]
  const total = year * 12 + (index - 1) + count
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export const currentMonth = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

// Last calendar day of a month, as YYYY-MM-DD.
export const monthEnd = (month: string) => {
  const [year, index] = month.split('-').map(Number) as [number, number]
  const day = new Date(Date.UTC(year, index, 0)).getUTCDate()
  return `${month}-${String(day).padStart(2, '0')}`
}

export const monthLabel = (month: string) => {
  const [year, index] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(year, index - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// ---- Input ------------------------------------------------------------------

const name = (label: string) => z.string().trim().min(1, `Enter ${label}`).max(120)
const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).nullable()
const cents = z.number().int('Use whole cents').refine(Number.isSafeInteger, 'Amount is too large')

export const accountCreateSchema = z.object({
  name: name('a name'),
  kind: z.enum(ACCOUNT_KINDS),
  institution: optionalText(120),
  openingBalanceCents: cents,
})

export const accountUpdateSchema = z.object({
  name: name('a name'),
  kind: z.enum(ACCOUNT_KINDS),
  institution: optionalText(120),
  // Manual accounts only; the bank reports a SimpleFIN account's balance.
  openingBalanceCents: cents,
  sortOrder: z.number().int(),
  archived: z.boolean(),
}).partial()

export const categoryGroupSchema = z.object({
  name: name('a group name'),
})

export const categoryGroupUpdateSchema = categoryGroupSchema.extend({
  sortOrder: z.number().int(),
  archived: z.boolean(),
}).partial()

export const categorySchema = z.object({
  groupId: z.string().min(1, 'Choose a group'),
  name: name('a category name'),
  rollover: z.boolean(),
  isSensitive: z.boolean(),
})

export const categoryUpdateSchema = categorySchema.extend({
  sortOrder: z.number().int(),
  archived: z.boolean(),
}).partial()

export const fundingSchema = z.object({
  fundedCents: cents,
})

export const splitSchema = z.object({
  categoryId: z.string().min(1).nullable(),
  amountCents: cents,
  memo: optionalText(200),
})

export const splitsSchema = z.object({
  splits: z.array(splitSchema).min(1, 'Add at least one line').max(50),
})

export const manualTransactionSchema = z.object({
  accountId: z.string().min(1, 'Choose an account'),
  postedOn: z.iso.date('Enter a date'),
  amountCents: cents.refine(value => value !== 0, 'Enter an amount'),
  payee: optionalText(120),
  memo: optionalText(200),
  categoryId: z.string().min(1).nullable(),
})

export const transactionUpdateSchema = z.object({
  payee: optionalText(120),
  memo: optionalText(200),
  isTransfer: z.boolean(),
}).partial()

export const payeeRuleSchema = z.object({
  matchText: z.string().trim().min(2, 'Enter at least two characters').max(120),
  payee: optionalText(120),
  categoryId: z.string().min(1).nullable(),
})

export const payeeRuleUpdateSchema = payeeRuleSchema.extend({
  sortOrder: z.number().int(),
}).partial()

export const transactionsQuerySchema = z.object({
  accountId: z.string().min(1).optional(),
  // A category id, or "uncategorized".
  categoryId: z.string().min(1).optional(),
  month: monthSchema.optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
})

export const ministryAccessSchema = z.object({
  ministryId: z.string().min(1),
  categoryId: z.string().min(1),
  // `none` removes the grant.
  level: z.enum(['none', ...MINISTRY_ACCESS_LEVELS]),
  audience: z.enum(MINISTRY_ACCESS_AUDIENCES),
})

// ---- Views ------------------------------------------------------------------

export interface AccountView {
  id: string
  name: string
  kind: AccountKind
  source: 'simplefin' | 'manual'
  institution: string | null
  isCash: boolean
  balanceCents: number
  balanceDate: string | null
  openingBalanceCents: number
  sortOrder: number
  archivedAt: string | null
}

export interface CategoryView {
  id: string
  groupId: string
  name: string
  kind: 'spending' | 'availableToFund'
  rollover: boolean
  isSensitive: boolean
  sortOrder: number
  archivedAt: string | null
}

export interface CategoryGroupView {
  id: string
  name: string
  sortOrder: number
  archivedAt: string | null
  categories: CategoryView[]
}

export interface BudgetCategoryRow {
  id: string
  name: string
  rollover: boolean
  isSensitive: boolean
  fundedCents: number
  activityCents: number
  remainingCents: number
  // Present when the category has a plan (not sent to ministries).
  plan?: PlanStatus
}

export interface BudgetMonthView {
  month: string
  cashCents: number
  availableToFundCents: number
  // Transactions not yet given a category, in cash accounts, through this month.
  uncategorizedCents: number
  uncategorizedCount: number
  // What plans still need funded this month.
  neededCents: number
  groups: Array<{
    id: string
    name: string
    fundedCents: number
    activityCents: number
    remainingCents: number
    neededCents: number
    categories: BudgetCategoryRow[]
  }>
}

export interface SplitView {
  id: string
  categoryId: string | null
  categoryName: string | null
  amountCents: number
  memo: string | null
}

export interface TransactionView {
  id: string
  accountId: string
  accountName: string
  postedOn: string
  amountCents: number
  // Only sent to people who keep the budget.
  bankDescription?: string | null
  payee: string | null
  memo: string | null
  isTransfer: boolean
  source: 'simplefin' | 'manual'
  splits: SplitView[]
}

export interface TransactionPage {
  transactions: TransactionView[]
  total: number
  page: number
  pageSize: number
}

export interface SyncRunView {
  id: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'succeeded' | 'failed'
  accountsSeen: number
  transactionsAdded: number
  messages: string[]
}

export interface PayeeRuleView {
  id: string
  matchText: string
  payee: string | null
  categoryId: string | null
  categoryName: string | null
  sortOrder: number
}

// What grant managers work with: names only, never amounts.
export interface MinistryAccessMatrix {
  ministries: Array<{ id: string, slug: string, name: string }>
  groups: Array<{ id: string, name: string, categories: Array<{ id: string, name: string, isSensitive: boolean }> }>
  grants: Array<{ ministryId: string, categoryId: string, level: MinistryAccessLevel, audience: MinistryAccessAudience }>
}

export interface MinistryBudgetSummary {
  slug: string
  name: string
  categoryCount: number
}

export interface MinistryBudgetView {
  ministry: { slug: string, name: string }
  month: string
  categories: Array<BudgetCategoryRow & {
    level: MinistryAccessLevel
    // Present only at `ledger` level.
    ledger?: Array<{ id: string, postedOn: string, payee: string | null, memo: string | null, amountCents: number }>
  }>
}

// ---- Plans ------------------------------------------------------------------

export const PLAN_SOURCES = ['custom', 'recurring'] as const
export const PLAN_KINDS = ['fillUpTo', 'add'] as const
export const PLAN_CADENCES = ['monthly', 'byDate'] as const
export const PLAN_DEADLINES = ['byMonth', 'byDate'] as const
export const PLAN_REPEATS = ['none', 'monthly', 'quarterly', 'yearly'] as const

export type PlanSource = typeof PLAN_SOURCES[number]
export type PlanKind = typeof PLAN_KINDS[number]
export type PlanCadence = typeof PLAN_CADENCES[number]
export type PlanDeadline = typeof PLAN_DEADLINES[number]
export type PlanRepeat = typeof PLAN_REPEATS[number]

export const PLAN_REPEAT_LABELS: Record<PlanRepeat, string> = {
  none: 'Doesn’t repeat',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export const planSchema = z.object({
  source: z.enum(PLAN_SOURCES),
  kind: z.enum(PLAN_KINDS),
  cadence: z.enum(PLAN_CADENCES),
  amountCents: cents,
  dueOn: z.iso.date().nullable(),
  deadline: z.enum(PLAN_DEADLINES),
  repeat: z.enum(PLAN_REPEATS),
  startMonth: monthSchema,
  // Dated plans need a rollover category; this switches it.
  switchToRollover: z.boolean().optional(),
}).superRefine((plan, ctx) => {
  if (plan.source === 'recurring') return
  if (plan.amountCents <= 0) ctx.addIssue({ code: 'custom', path: ['amountCents'], message: 'Enter an amount' })
  if (plan.cadence === 'byDate' && !plan.dueOn) ctx.addIssue({ code: 'custom', path: ['dueOn'], message: 'Choose a date' })
  if (plan.cadence === 'byDate' && plan.dueOn && plan.dueOn.slice(0, 7) < plan.startMonth) {
    ctx.addIssue({ code: 'custom', path: ['dueOn'], message: 'The date must be on or after the starting month' })
  }
})

export type PlanInput = z.infer<typeof planSchema>

export interface PlanView {
  categoryId: string
  source: PlanSource
  kind: PlanKind
  cadence: PlanCadence
  amountCents: number
  dueOn: string | null
  deadline: PlanDeadline
  repeat: PlanRepeat
  startMonth: string
}

export const PLAN_STATUSES = ['notStarted', 'onTrack', 'underfunded', 'late', 'overspent'] as const
export type PlanStatusName = typeof PLAN_STATUSES[number]

export interface PlanStatus {
  status: PlanStatusName
  neededCents: number
  // The amount being worked toward in the current cycle.
  targetCents: number
  // The due date of the current cycle, for dated plans.
  dueOn: string | null
  deadline: PlanDeadline | null
}

// ---- Recurring transactions -------------------------------------------------

export const RECURRING_FREQUENCIES = ['weekly', 'every2Weeks', 'monthly', 'quarterly', 'yearly'] as const
export type RecurringFrequency = typeof RECURRING_FREQUENCIES[number]
export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Weekly',
  every2Weeks: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export const recurringSchema = z.object({
  name: name('a name'),
  payee: optionalText(120),
  memo: optionalText(200),
  amountCents: cents.refine(value => value !== 0, 'Enter an amount'),
  amountVaries: z.boolean(),
  frequency: z.enum(RECURRING_FREQUENCIES),
  anchorOn: z.iso.date('Choose the first date'),
  endOn: z.iso.date().nullable(),
  accountId: z.string().min(1).nullable(),
  categoryId: z.string().min(1).nullable(),
  feedsPlan: z.boolean(),
  matchBank: z.boolean(),
  matchText: optionalText(120),
  autoEnter: z.boolean(),
}).superRefine((item, ctx) => {
  if ((item.feedsPlan || item.matchBank || item.autoEnter) && !item.categoryId) {
    ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Choose a category for plans, matching or entering automatically' })
  }
  if (item.autoEnter && !item.accountId) {
    ctx.addIssue({ code: 'custom', path: ['accountId'], message: 'Choose the manual account to enter it in' })
  }
  if (item.endOn && item.endOn < item.anchorOn) {
    ctx.addIssue({ code: 'custom', path: ['endOn'], message: 'The end date must be after the first date' })
  }
})

export type RecurringInput = z.infer<typeof recurringSchema>

export const skipOccurrenceSchema = z.object({ dueOn: z.iso.date() })

export interface RecurringView extends Omit<RecurringInput, 'payee' | 'memo' | 'matchText'> {
  id: string
  payee: string | null
  memo: string | null
  matchText: string | null
  accountName: string | null
  categoryName: string | null
  isSensitive: boolean
  nextDueOn: string | null
  archivedAt: string | null
}

export interface UpcomingOccurrence {
  recurringId: string
  name: string
  payee: string | null
  amountCents: number
  dueOn: string
  categoryId: string | null
  categoryName: string | null
  isSensitive: boolean
  accountName: string | null
  // open: not yet due or handled; overdue: past due and not handled.
  status: 'open' | 'overdue' | 'paid' | 'entered' | 'skipped'
  transactionId: string | null
}

export interface FundPlansResult {
  month: string
  lines: Array<{ categoryId: string, name: string, neededCents: number, fundCents: number }>
  totalCents: number
  shortfallCents: number
  availableToFundCents: number
}
