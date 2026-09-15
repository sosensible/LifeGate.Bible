// Stewardship route helpers, auto-imported into server routes.
import type { H3Event } from 'h3'
import { monthSchema } from '../../shared/stewardship.ts'

// The :month route parameter, as YYYY-MM.
export const monthParam = (event: H3Event) => {
  const parsed = monthSchema.safeParse(getRouterParam(event, 'month'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Use a month like 2026-09' })
  return parsed.data
}
