import { asc, count, eq } from 'drizzle-orm'
import { households, people } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { people: ['update'] })
  const list = db
    .select({ id: households.id, name: households.name, memberCount: count(people.id) })
    .from(households)
    .leftJoin(people, eq(people.householdId, households.id))
    .groupBy(households.id)
    .orderBy(asc(households.name))
    .all()
  return { households: list }
})
