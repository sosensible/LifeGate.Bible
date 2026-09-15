// Adding, editing and removing ministries. Names and descriptions are public;
// who serves is kept in ministry_members and edited with each person.
import { and, asc, count, eq, like, ne, or, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { MinistryAdminView, MinistryInput } from '../../shared/ministries.ts'
import { PROTECTED_MINISTRY_SLUGS } from '../../shared/ministries.ts'
import { slugify } from '../../shared/missions.ts'
import { ministries, ministryCategoryAccess, ministryMembers } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { db } from './db.ts'

type Reader = Tx | typeof db

const isProtected = (slug: string) => (PROTECTED_MINISTRY_SLUGS as readonly string[]).includes(slug)

export const loadMinistriesForAdmin = (reader: Reader = db): MinistryAdminView[] => {
  const serving = new Map(reader
    .select({ id: ministryMembers.ministryId, n: count(), leaders: sql<number>`sum(${ministryMembers.isLeader})` })
    .from(ministryMembers).groupBy(ministryMembers.ministryId).all()
    .map(row => [row.id, row]))
  const grants = new Map(reader
    .select({ id: ministryCategoryAccess.ministryId, n: count() })
    .from(ministryCategoryAccess).groupBy(ministryCategoryAccess.ministryId).all()
    .map(row => [row.id, row.n]))
  return reader.select().from(ministries).orderBy(asc(ministries.name)).all().map(m => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    description: m.description,
    servingCount: serving.get(m.id)?.n ?? 0,
    leaderCount: serving.get(m.id)?.leaders ?? 0,
    budgetGrantCount: grants.get(m.id) ?? 0,
    protected: isProtected(m.slug),
  }))
}

const findMinistry = (reader: Reader, id: string) => {
  const ministry = reader.select().from(ministries).where(eq(ministries.id, id)).get()
  if (!ministry) throw createError({ statusCode: 404, statusMessage: 'Ministry not found' })
  return ministry
}

const assertNameFree = (reader: Reader, name: string, exceptId?: string) => {
  const clash = reader.select({ id: ministries.id }).from(ministries)
    .where(and(sql`lower(${ministries.name}) = lower(${name})`, exceptId ? ne(ministries.id, exceptId) : undefined)).get()
  if (clash) throw createError({ statusCode: 409, statusMessage: 'A ministry with that name already exists' })
}

// "Youth Group" -> "youth-group", then "youth-group-2" if taken.
const uniqueSlug = (reader: Reader, name: string) => {
  const base = slugify(name) || 'ministry'
  const taken = new Set(reader.select({ slug: ministries.slug }).from(ministries)
    .where(or(eq(ministries.slug, base), like(ministries.slug, `${base}-%`))).all().map(r => r.slug))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export const createMinistry = (tx: Tx, input: MinistryInput) => {
  assertNameFree(tx, input.name)
  const last = tx.select({ max: sql<number | null>`max(${ministries.sortOrder})` }).from(ministries).get()?.max ?? -1
  return tx.insert(ministries).values({ ...input, slug: uniqueSlug(tx, input.name), sortOrder: last + 1 })
    .returning({ id: ministries.id }).get().id
}

// The slug does not change with the name, so shared links keep working.
export const updateMinistry = (tx: Tx, id: string, input: MinistryInput) => {
  const ministry = findMinistry(tx, id)
  assertNameFree(tx, input.name, id)
  const fields = (Object.keys(input) as Array<keyof MinistryInput>).filter(f => input[f] !== ministry[f])
  if (fields.length) tx.update(ministries).set(Object.fromEntries(fields.map(f => [f, input[f]]))).where(eq(ministries.id, id)).run()
  return fields
}

// Only a ministry nobody serves in and no budget is shared with, so removing
// it never silently drops a roster or a Stewardship decision.
export const deleteMinistry = (tx: Tx, id: string) => {
  const ministry = findMinistry(tx, id)
  if (isProtected(ministry.slug)) {
    throw createError({ statusCode: 400, statusMessage: 'The Missions ministry decides who can edit the Missions pages, so it can’t be removed' })
  }
  const serving = tx.select({ n: count() }).from(ministryMembers).where(eq(ministryMembers.ministryId, id)).get()?.n ?? 0
  if (serving) throw createError({ statusCode: 409, statusMessage: 'People serve in this ministry. Take them off it first (People page).' })
  const grants = tx.select({ n: count() }).from(ministryCategoryAccess).where(eq(ministryCategoryAccess.ministryId, id)).get()?.n ?? 0
  if (grants) throw createError({ statusCode: 409, statusMessage: 'Budget categories are shared with this ministry. Remove that access first (Stewardship → Ministry access).' })
  tx.delete(ministries).where(eq(ministries.id, id)).run()
  return ministry
}
