import { and, asc, eq } from 'drizzle-orm'
import { households, people } from '../../../../../database/schema/index.ts'
import { db } from '../../../../../lib/db.ts'

// Households and adult members to link a giving record to: names only, the
// same names every member sees in the directory. No contact details.
export default defineEventHandler(async (event) => {
  await requirePermission(event, { giving: ['manage'] })
  return {
    households: db.select({ id: households.id, name: households.name }).from(households).orderBy(asc(households.name)).all(),
    people: db.select({ id: people.id, firstName: people.firstName, lastName: people.lastName })
      .from(people)
      .where(and(eq(people.isMinor, false), eq(people.kind, 'member')))
      .orderBy(asc(people.lastName), asc(people.firstName))
      .all()
      .map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}` })),
  }
})
