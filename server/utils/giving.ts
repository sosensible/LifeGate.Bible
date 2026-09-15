// Giving route helpers, auto-imported into server routes.
import type { H3Event } from 'h3'
import { yearSchema } from '../../shared/giving.ts'
import { db } from '../lib/db.ts'
import { findCount } from '../lib/giving.ts'

// The :year route parameter.
export const yearParam = (event: H3Event) => {
  const parsed = yearSchema.safeParse(getRouterParam(event, 'year'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Use a year like 2027' })
  return parsed.data
}

// ?year=, defaulting to this year.
export const yearQuery = (event: H3Event) => {
  const value = getQuery(event).year
  if (value === undefined || value === '') return new Date().getFullYear()
  const parsed = yearSchema.safeParse(value)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Use a year like 2027' })
  return parsed.data
}

// Counters work only in open counts; a closed count is the Treasurer's.
export const requireCountAccess = async (event: H3Event, options: { write: boolean }) => {
  const viewer = await getGivingViewer(event)
  const id = getRouterParam(event, 'id')!
  const count = findCount(db, id)
  if (options.write && !viewer.canRecord) throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  if (!viewer.canView && count.status !== 'open') throw createError({ statusCode: 403, statusMessage: 'This count is closed' })
  return { ...viewer, count }
}
