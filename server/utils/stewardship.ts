// Stewardship route helpers, auto-imported into server routes.
import type { H3Event } from 'h3'
import { monthSchema, reportPeriodSchema } from '../../shared/stewardship.ts'

// The :month route parameter, as YYYY-MM.
export const monthParam = (event: H3Event) => {
  const parsed = monthSchema.safeParse(getRouterParam(event, 'month'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Use a month like 2026-09' })
  return parsed.data
}

// The :year and :half route parameters of a semi-annual report.
export const reportPeriodParam = (event: H3Event) => {
  const parsed = reportPeriodSchema.safeParse({ year: getRouterParam(event, 'year'), half: getRouterParam(event, 'half') })
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Use a year like 2027 and half 1 or 2' })
  return parsed.data
}
