// Lifegate's own tables. Better Auth's tables live in ./auth.ts (generated).
//
// People are NOT accounts. A person is a directory record and can exist
// without ever signing in (children, homebound members, a spouse who never
// logs in). An account may link to at most one person via `people.userId`.
import { relations } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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

export const peopleRelations = relations(people, ({ one }) => ({
  household: one(households, { fields: [people.householdId], references: [households.id] }),
  user: one(user, { fields: [people.userId], references: [user.id] }),
}))
