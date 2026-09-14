// Lifegate's own tables. Better Auth's tables live in ./auth.ts (generated).
//
// People are NOT accounts. A person is a directory record and can exist
// without ever signing in (children, homebound members, a spouse who never
// logs in). An account may link to at most one person via `people.userId`.
import { relations } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
const createdAt = () => integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
const updatedAt = () => integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date())

export const households = sqliteTable('households', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const people = sqliteTable('people', {
  id: id(),
  householdId: text('household_id').references(() => households.id, { onDelete: 'set null' }),
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
