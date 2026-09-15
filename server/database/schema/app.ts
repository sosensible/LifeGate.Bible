// Lifegate's own tables. Better Auth's tables live in ./auth.ts (generated).
//
// People are NOT accounts. A person is a directory record and can exist
// without ever signing in (children, homebound members, a spouse who never
// logs in). An account may link to at most one person via `people.userId`.
import { relations } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
const createdAt = () => integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
const updatedAt = () => integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date())

// Who runs the house (a married couple, one adult, or two guardians) and
// whether they are the children's family or guardians. The rules and naming
// live in shared/households.ts.
export const households = sqliteTable('households', {
  id: id(),
  kind: text('kind', { enum: ['married', 'singleParent', 'guardians'] }).notNull().default('married'),
  // Father and mother, or guardians.
  relationship: text('relationship', { enum: ['family', 'guardian'] }).notNull().default('family'),
  // Built from the adults' names unless someone typed their own.
  name: text('name').notNull(),
  nameIsCustom: integer('name_is_custom', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const people = sqliteTable('people', {
  id: id(),
  householdId: text('household_id').references(() => households.id, { onDelete: 'set null' }),
  // Set only through the household editor, together with householdId.
  householdRole: text('household_role', { enum: ['husband', 'wife', 'father', 'mother', 'guardian', 'child'] }),
  // A guest is someone the church keeps a record of who is not a member, such
  // as a guest speaker. Guests are not in the members list, rosters or households.
  kind: text('kind', { enum: ['member', 'guest'] }).notNull().default('member'),
  isSpeaker: integer('is_speaker', { mode: 'boolean' }).notNull().default(false),
  // An archived speaker is off the Speakers list; staff and admins can restore
  // them, or remove them (a guest's record, or a member's speaker listing).
  speakerArchivedAt: integer('speaker_archived_at', { mode: 'timestamp' }),
  userId: text('user_id').unique().references(() => user.id, { onDelete: 'set null' }),

  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  // Minors are never listed to other members. Their names are not "adult names".
  isMinor: integer('is_minor', { mode: 'boolean' }).notNull().default(false),
  // Church office shown beside the name, e.g. "Deacon". Not personal info.
  title: text('title'),

  // Contact info: staff always see these; other members only if opted in.
  phone: text('phone'),
  email: text('email'),
  address: text('address'),

  // Other personal info: opt-in for everyone, staff included.
  birthday: text('birthday'), // ISO date, YYYY-MM-DD
  photoUrl: text('photo_url'),

  // Each person's own choices. Everything defaults to NOT shared.
  sharePhone: integer('share_phone', { mode: 'boolean' }).notNull().default(false),
  shareEmail: integer('share_email', { mode: 'boolean' }).notNull().default(false),
  shareAddress: integer('share_address', { mode: 'boolean' }).notNull().default(false),
  shareBirthday: integer('share_birthday', { mode: 'boolean' }).notNull().default(false),
  sharePhoto: integer('share_photo', { mode: 'boolean' }).notNull().default(false),
  shareHousehold: integer('share_household', { mode: 'boolean' }).notNull().default(false),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('people_household_idx').on(table.householdId),
  index('people_name_idx').on(table.lastName, table.firstName),
])

// Ministries are public content: name and description show to everyone. Who
// serves in each (ministry_members) is members-only.
export const ministries = sqliteTable('ministries', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const ministryMembers = sqliteTable('ministry_members', {
  ministryId: text('ministry_id').notNull().references(() => ministries.id, { onDelete: 'cascade' }),
  personId: text('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  // Set by the church office.
  isLeader: integer('is_leader', { mode: 'boolean' }).notNull().default(false),
  // The person's own choices for this ministry's roster: members see them
  // unless they opt out; the public sees them only if they opt in (and are
  // shown to members).
  showToMembers: integer('show_to_members', { mode: 'boolean' }).notNull().default(true),
  showPublicly: integer('show_publicly', { mode: 'boolean' }).notNull().default(false),
}, table => [
  primaryKey({ columns: [table.ministryId, table.personId] }),
  index('ministry_members_person_idx').on(table.personId),
])

export const sermonSeries = sqliteTable('sermon_series', {
  id: id(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const SERMON_VISIBILITY = ['public', 'members'] as const
export const SERMON_STATUS = ['draft', 'published'] as const
export const VIDEO_PROVIDERS = ['youtube'] as const

export const sermons = sqliteTable('sermons', {
  id: id(),
  // Set once from the date and title so shared links never break.
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  preachedOn: text('preached_on').notNull(), // YYYY-MM-DD
  speaker: text('speaker').notNull(),
  // The person on the Speakers list who taught it, when they are on it (guests
  // can be typed without one). A teacher with an account may edit their own
  // messages' details, but not the video, speaker, audience or status.
  speakerPersonId: text('speaker_person_id').references(() => people.id, { onDelete: 'set null' }),
  seriesId: text('series_id').references(() => sermonSeries.id, { onDelete: 'set null' }),
  scripture: text('scripture'), // as written, e.g. "John 10:1–18"
  books: text('books', { mode: 'json' }).$type<string[]>().notNull().default([]),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  description: text('description'),

  // Media is provider + id, so where videos live can change later. For an
  // unlisted YouTube video the id is effectively the key to watching it, so it
  // is only ever sent to someone allowed to see the sermon.
  videoProvider: text('video_provider', { enum: VIDEO_PROVIDERS }),
  videoId: text('video_id'),

  // New sermons start members-only and unpublished.
  visibility: text('visibility', { enum: SERMON_VISIBILITY }).notNull().default('members'),
  status: text('status', { enum: SERMON_STATUS }).notNull().default('draft'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('sermons_listing_idx').on(table.status, table.preachedOn),
  index('sermons_series_idx').on(table.seriesId),
  index('sermons_speaker_person_idx').on(table.speakerPersonId),
])

// Live meetings: a Google Meet or YouTube Live link shown only at scheduled
// times. The rules live in shared/live.ts. A members-only link is the key to
// joining, so it is only ever sent to members.
export const LIVE_KINDS = ['meet', 'youtube'] as const
export const LIVE_REPEATS = ['once', 'weekly'] as const

export const liveMeetings = sqliteTable('live_meetings', {
  id: id(),
  title: text('title').notNull(),
  kind: text('kind', { enum: LIVE_KINDS }).notNull(),
  link: text('link').notNull(),
  visibility: text('visibility', { enum: SERMON_VISIBILITY }).notNull().default('members'),
  repeat: text('repeat', { enum: LIVE_REPEATS }).notNull(),
  startsOn: text('starts_on').notNull(), // YYYY-MM-DD, the date or the first weekly date
  endsOn: text('ends_on'), // weekly: the last date it may happen
  startTime: text('start_time').notNull(), // HH:MM, church time
  endTime: text('end_time').notNull(),
  skippedDates: text('skipped_dates', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// Missions: members-only pages about the organizations Lifegate works with and
// the families and individuals it supports. Not public: some countries make it
// dangerous for missionaries to be identified online.
export const missionOrganizations = sqliteTable('mission_organizations', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  photo: text('photo'), // stored upload name, see server/lib/uploads.ts
  writeup: text('writeup'),
  website: text('website'),
  // How Lifegate relates to them, e.g. "Sends missionaries through".
  relationship: text('relationship'),
  // Archived entries are hidden from members; staff and admins can restore
  // or permanently remove them.
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const MISSIONARY_KINDS = ['family', 'individual'] as const
export const MISSIONARY_STATUS = ['onField', 'furlough', 'raisingSupport', 'retired'] as const

export const missionaries = sqliteTable('missionaries', {
  id: id(),
  slug: text('slug').notNull().unique(),
  kind: text('kind', { enum: MISSIONARY_KINDS }).notNull(),
  name: text('name').notNull(), // "Tom & Anna Reyes" or "Grace Lee"
  photo: text('photo'),
  writeup: text('writeup'),
  // Family members' first names, e.g. "Tom, Anna, Lucy and Sam".
  familyNames: text('family_names'),
  field: text('field'), // country or region
  focus: text('focus'), // church planting, Bible translation...
  organizationId: text('organization_id').references(() => missionOrganizations.id, { onDelete: 'set null' }),
  status: text('status', { enum: MISSIONARY_STATUS }).notNull().default('onField'),
  startedYear: integer('started_year'),
  supportUrl: text('support_url'),
  // Contact details are shown to members only when the missionaries agreed.
  email: text('email'),
  phone: text('phone'),
  mailingAddress: text('mailing_address'),
  website: text('website'),
  shareContact: integer('share_contact', { mode: 'boolean' }).notNull().default(false),
  nextVisitOn: text('next_visit_on'), // YYYY-MM-DD
  nextVisitNote: text('next_visit_note'),
  // Archived entries are hidden from members; staff and admins can restore
  // or permanently remove them.
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('missionaries_organization_idx').on(table.organizationId),
])

// Dated prayer requests and prayer letters from a missionary.
export const missionUpdates = sqliteTable('mission_updates', {
  id: id(),
  missionaryId: text('missionary_id').notNull().references(() => missionaries.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['prayer', 'letter'] }).notNull(),
  postedOn: text('posted_on').notNull(), // YYYY-MM-DD
  title: text('title'),
  body: text('body'),
  url: text('url'),
  createdAt: createdAt(),
}, table => [
  index('mission_updates_missionary_idx').on(table.missionaryId, table.postedOn),
])

// Stewardship: the church's accounts, transactions, categories and budget.
//
// Amounts are integer cents; negative is money out. Only cash accounts
// (checking, savings, cash) make up the budget: their combined balance is the
// money categories are funded from. Other accounts are tracked, not budgeted.
// The budget math lives in server/lib/budget.ts.
export const ACCOUNT_KINDS = ['checking', 'savings', 'cash', 'credit', 'other'] as const
export const ACCOUNT_SOURCES = ['simplefin', 'manual'] as const

export const financeAccounts = sqliteTable('finance_accounts', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ACCOUNT_KINDS }).notNull().default('checking'),
  source: text('source', { enum: ACCOUNT_SOURCES }).notNull().default('manual'),
  // SimpleFIN's account id; null for manual accounts.
  externalId: text('external_id').unique(),
  institution: text('institution'),
  // SimpleFIN accounts: the balance the bank last reported.
  balanceCents: integer('balance_cents'),
  balanceDate: integer('balance_date', { mode: 'timestamp' }),
  // Manual accounts: the balance before their first transaction.
  openingBalanceCents: integer('opening_balance_cents').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const SYNC_STATUS = ['running', 'succeeded', 'failed'] as const

export const syncRuns = sqliteTable('sync_runs', {
  id: id(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  status: text('status', { enum: SYNC_STATUS }).notNull().default('running'),
  accountsSeen: integer('accounts_seen').notNull().default(0),
  transactionsAdded: integer('transactions_added').notNull().default(0),
  // Messages from SimpleFIN's errlist (e.g. a bank needing to be reconnected).
  messages: text('messages', { mode: 'json' }).$type<string[]>().notNull().default([]),
  // Null when the schedule started it.
  triggeredByUserId: text('triggered_by_user_id').references(() => user.id, { onDelete: 'set null' }),
}, table => [
  index('sync_runs_started_idx').on(table.startedAt),
])

// How a group appears in semi-annual reports: each of its categories, or one
// line with the group's total (e.g. staff pay, so no one's salary is itemized).
export const REPORT_DETAILS = ['categories', 'total'] as const

export const categoryGroups = sqliteTable('category_groups', {
  id: id(),
  name: text('name').notNull(),
  reportDetail: text('report_detail', { enum: REPORT_DETAILS }).notNull().default('categories'),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// `availableToFund` is the one system category that income is assigned to when
// it is not for a particular category. Everything else is `spending`.
export const CATEGORY_KINDS = ['spending', 'availableToFund'] as const

export const categories = sqliteTable('categories', {
  id: id(),
  groupId: text('group_id').notNull().references(() => categoryGroups.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  kind: text('kind', { enum: CATEGORY_KINDS }).notNull().default('spending'),
  // Rollover: what is left carries into next month. Otherwise it returns to
  // Available to Fund at the end of each month.
  rollover: integer('rollover', { mode: 'boolean' }).notNull().default(true),
  // e.g. Benevolence: transactions name the people helped. Ministries can be
  // shown its totals only, never its ledger.
  isSensitive: integer('is_sensitive', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('categories_group_idx').on(table.groupId),
])

// How much was put into a category in a month. Negative moves money back out.
export const categoryMonths = sqliteTable('category_months', {
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  month: text('month').notNull(), // YYYY-MM
  fundedCents: integer('funded_cents').notNull().default(0),
  updatedAt: updatedAt(),
}, table => [
  primaryKey({ columns: [table.categoryId, table.month] }),
])

export const financeTransactions = sqliteTable('finance_transactions', {
  id: id(),
  accountId: text('account_id').notNull().references(() => financeAccounts.id, { onDelete: 'restrict' }),
  // SimpleFIN's transaction id, stable within an account; null when manual.
  externalId: text('external_id'),
  postedOn: text('posted_on').notNull(), // YYYY-MM-DD
  amountCents: integer('amount_cents').notNull(),
  // The bank's own wording. Can name people, so only managers see it.
  bankDescription: text('bank_description'),
  payee: text('payee'),
  memo: text('memo'),
  // Money moved between the church's own accounts: not spending or income.
  isTransfer: integer('is_transfer', { mode: 'boolean' }).notNull().default(false),
  source: text('source', { enum: ACCOUNT_SOURCES }).notNull().default('manual'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex('finance_transactions_external_idx').on(table.accountId, table.externalId),
  index('finance_transactions_posted_idx').on(table.postedOn),
])

// Every transaction has at least one split; together they add up to its amount.
// A split with no category is uncategorized.
export const transactionSplits = sqliteTable('transaction_splits', {
  id: id(),
  transactionId: text('transaction_id').notNull().references(() => financeTransactions.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'restrict' }),
  amountCents: integer('amount_cents').notNull(),
  memo: text('memo'),
  sortOrder: integer('sort_order').notNull().default(0),
}, table => [
  index('transaction_splits_transaction_idx').on(table.transactionId),
  index('transaction_splits_category_idx').on(table.categoryId),
])

// Applied to newly imported transactions: the first rule whose text appears in
// the bank's description sets the payee and category.
export const payeeRules = sqliteTable('payee_rules', {
  id: id(),
  matchText: text('match_text').notNull(),
  payee: text('payee'),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// What a ministry may see of a category, decided by pastors, deacons and the
// church secretary. `totals`: funded, activity and remaining. `ledger`: those
// plus the transactions. `audience`: the ministry's leaders, or everyone in it.
export const MINISTRY_ACCESS_LEVELS = ['totals', 'ledger'] as const
export const MINISTRY_ACCESS_AUDIENCES = ['leaders', 'members'] as const

export const ministryCategoryAccess = sqliteTable('ministry_category_access', {
  ministryId: text('ministry_id').notNull().references(() => ministries.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  level: text('level', { enum: MINISTRY_ACCESS_LEVELS }).notNull(),
  audience: text('audience', { enum: MINISTRY_ACCESS_AUDIENCES }).notNull().default('leaders'),
  grantedByUserId: text('granted_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
}, table => [
  primaryKey({ columns: [table.ministryId, table.categoryId] }),
  index('ministry_category_access_category_idx').on(table.categoryId),
])

// A category's plan: what it should be funded. The math is in server/lib/plans.ts.
//   kind:     fillUpTo (reach an amount) or add (set aside an amount)
//   cadence:  monthly, or byDate (by dueOn)
//   deadline: byMonth (funded before the due month starts) or byDate (the due month counts)
//   source:   custom, or recurring (built from the category's recurring bills)
export const PLAN_SOURCES = ['custom', 'recurring'] as const
export const PLAN_KINDS = ['fillUpTo', 'add'] as const
export const PLAN_CADENCES = ['monthly', 'byDate'] as const
export const PLAN_DEADLINES = ['byMonth', 'byDate'] as const
export const PLAN_REPEATS = ['none', 'monthly', 'quarterly', 'yearly'] as const

export const categoryPlans = sqliteTable('category_plans', {
  categoryId: text('category_id').primaryKey().references(() => categories.id, { onDelete: 'cascade' }),
  source: text('source', { enum: PLAN_SOURCES }).notNull().default('custom'),
  kind: text('kind', { enum: PLAN_KINDS }).notNull().default('add'),
  cadence: text('cadence', { enum: PLAN_CADENCES }).notNull().default('monthly'),
  amountCents: integer('amount_cents').notNull().default(0),
  dueOn: text('due_on'), // YYYY-MM-DD
  deadline: text('deadline', { enum: PLAN_DEADLINES }).notNull().default('byDate'),
  repeat: text('repeat', { enum: PLAN_REPEATS }).notNull().default('none'),
  startMonth: text('start_month').notNull(), // YYYY-MM
  updatedAt: updatedAt(),
})

// Bills and other transactions that repeat. Each can be a reminder, feed its
// category's plan, be matched to bank imports, and/or be entered automatically
// in a manual account. See server/lib/recurring.ts.
export const RECURRING_FREQUENCIES = ['weekly', 'every2Weeks', 'monthly', 'quarterly', 'yearly'] as const

export const recurringTransactions = sqliteTable('recurring_transactions', {
  id: id(),
  name: text('name').notNull(),
  payee: text('payee'),
  memo: text('memo'),
  amountCents: integer('amount_cents').notNull(), // negative is money out
  amountVaries: integer('amount_varies', { mode: 'boolean' }).notNull().default(false),
  frequency: text('frequency', { enum: RECURRING_FREQUENCIES }).notNull(),
  anchorOn: text('anchor_on').notNull(), // YYYY-MM-DD, the first occurrence
  endOn: text('end_on'),
  accountId: text('account_id').references(() => financeAccounts.id, { onDelete: 'restrict' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  feedsPlan: integer('feeds_plan', { mode: 'boolean' }).notNull().default(false),
  matchBank: integer('match_bank', { mode: 'boolean' }).notNull().default(false),
  // When set, a bank transaction must contain this text to match.
  matchText: text('match_text'),
  autoEnter: integer('auto_enter', { mode: 'boolean' }).notNull().default(false),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('recurring_transactions_category_idx').on(table.categoryId),
])

// Occurrences that have been dealt with, so none is matched or entered twice.
export const OCCURRENCE_STATUS = ['paid', 'entered', 'skipped'] as const

export const recurringOccurrences = sqliteTable('recurring_occurrences', {
  recurringId: text('recurring_id').notNull().references(() => recurringTransactions.id, { onDelete: 'cascade' }),
  dueOn: text('due_on').notNull(),
  status: text('status', { enum: OCCURRENCE_STATUS }).notNull(),
  transactionId: text('transaction_id').references(() => financeTransactions.id, { onDelete: 'set null' }),
  handledAt: integer('handled_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, table => [
  primaryKey({ columns: [table.recurringId, table.dueOn] }),
])

// Giving: offerings and year-end statements. Donor-level, so only the Treasurer
// and counters reach these tables (see shared/auth/permissions.ts). The rules
// live in server/lib/giving.ts and server/lib/statements.ts.

// A giving record: who a statement goes to. Usually a household. It keeps its
// own name, address and email, entered by the Treasurer, so it survives the
// directory record being removed and never exposes the directory's contact
// details to someone who cannot review them.
export const GIVER_DELIVERY = ['email', 'mail'] as const

export const givers = sqliteTable('givers', {
  id: id(),
  householdId: text('household_id').references(() => households.id, { onDelete: 'set null' }),
  personId: text('person_id').references(() => people.id, { onDelete: 'set null' }),
  statementName: text('statement_name').notNull(),
  mailingAddress: text('mailing_address'),
  email: text('email'),
  delivery: text('delivery', { enum: GIVER_DELIVERY }).notNull().default('mail'),
  notes: text('notes'),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('givers_name_idx').on(table.statementName),
  index('givers_household_idx').on(table.householdId),
  index('givers_person_idx').on(table.personId),
])

// One counting of an offering, e.g. Sunday morning. Counters enter gifts while
// it is open; the Treasurer closes it once it matches the count sheet.
export const COUNT_STATUS = ['open', 'closed'] as const

export const offeringCounts = sqliteTable('offering_counts', {
  id: id(),
  countedOn: text('counted_on').notNull(), // YYYY-MM-DD
  label: text('label'),
  status: text('status', { enum: COUNT_STATUS }).notNull().default('open'),
  // The count sheet's totals, which the entered gifts must match to close.
  expectedCashCents: integer('expected_cash_cents').notNull().default(0),
  expectedCheckCents: integer('expected_check_cents').notNull().default(0),
  counterNames: text('counter_names'),
  notes: text('notes'),
  openedByUserId: text('opened_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  closedByUserId: text('closed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
  // The bank (or cash box) transaction this count was deposited as.
  depositTransactionId: text('deposit_transaction_id').references(() => financeTransactions.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('offering_counts_counted_idx').on(table.countedOn),
])

export const GIFT_METHODS = ['cash', 'check', 'online', 'bankTransfer', 'other'] as const

// A gift with no category is undesignated: it goes to Available to Fund when
// the count's deposit is linked. A designated gift names the budget category it
// was given for. A check split between the two is two gifts. A gift with no
// giver is loose or anonymous: counted, never on a statement.
export const gifts = sqliteTable('gifts', {
  id: id(),
  countId: text('count_id').notNull().references(() => offeringCounts.id, { onDelete: 'cascade' }),
  giverId: text('giver_id').references(() => givers.id, { onDelete: 'restrict' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'restrict' }),
  amountCents: integer('amount_cents').notNull(),
  method: text('method', { enum: GIFT_METHODS }).notNull(),
  checkNumber: text('check_number'),
  // The count's date unless changed, e.g. a check mailed by December 31.
  receivedOn: text('received_on').notNull(), // YYYY-MM-DD
  // What a designated gift is for when the category alone doesn't say, e.g.
  // "VBS snacks". Kept with the gift: it is not copied to the deposit's budget
  // lines, which ministries can see.
  memo: text('memo'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('gifts_giver_idx').on(table.giverId, table.receivedOn),
  index('gifts_count_idx').on(table.countId),
])

// The church's details printed on statements. One row, id 'church'.
export const statementSettings = sqliteTable('statement_settings', {
  id: text('id').primaryKey(),
  legalName: text('legal_name').notNull(),
  mailingAddress: text('mailing_address'),
  ein: text('ein'),
  signerName: text('signer_name'),
  signerTitle: text('signer_title'),
  closingMessage: text('closing_message'),
  emailSubject: text('email_subject'),
  updatedAt: updatedAt(),
})

// Statements sent or printed, so the Treasurer can see what went out and
// notice when a statement changed afterward.
export const STATEMENT_DELIVERY_METHODS = ['email', 'print'] as const

export const statementDeliveries = sqliteTable('statement_deliveries', {
  id: id(),
  giverId: text('giver_id').notNull().references(() => givers.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  method: text('method', { enum: STATEMENT_DELIVERY_METHODS }).notNull(),
  sentTo: text('sent_to'),
  status: text('status', { enum: ['sent', 'failed'] }).notNull(),
  error: text('error'),
  totalCents: integer('total_cents').notNull(),
  sentByUserId: text('sent_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, table => [
  index('statement_deliveries_giver_idx').on(table.giverId, table.year),
])

// Who changed what, and when. Written for changes to people, privacy
// settings, roles and accounts.
export const auditLog = sqliteTable('audit_log', {
  id: id(),
  actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
  action: text('action').notNull(),         // e.g. 'person.update', 'privacy.update', 'role.set'
  entityType: text('entity_type').notNull(), // e.g. 'person', 'user'
  entityId: text('entity_id'),
  details: text('details', { mode: 'json' }),
  createdAt: createdAt(),
}, table => [
  index('audit_entity_idx').on(table.entityType, table.entityId),
  index('audit_created_idx').on(table.createdAt),
])

export const householdRelations = relations(households, ({ many }) => ({
  people: many(people),
}))

export const peopleRelations = relations(people, ({ one, many }) => ({
  household: one(households, { fields: [people.householdId], references: [households.id] }),
  user: one(user, { fields: [people.userId], references: [user.id] }),
  ministries: many(ministryMembers),
}))

export const ministryRelations = relations(ministries, ({ many }) => ({
  members: many(ministryMembers),
}))

export const sermonRelations = relations(sermons, ({ one }) => ({
  series: one(sermonSeries, { fields: [sermons.seriesId], references: [sermonSeries.id] }),
}))

export const sermonSeriesRelations = relations(sermonSeries, ({ many }) => ({
  sermons: many(sermons),
}))

export const ministryMemberRelations = relations(ministryMembers, ({ one }) => ({
  ministry: one(ministries, { fields: [ministryMembers.ministryId], references: [ministries.id] }),
  person: one(people, { fields: [ministryMembers.personId], references: [people.id] }),
}))
