// Occurrences in a month (or for one category), open or handled.
import { z } from 'zod'
import { monthEnd, monthSchema } from '../../../../../../shared/stewardship.ts'
import { maskRecurring, upcoming } from '../../../../../lib/recurring.ts'

const querySchema = z.object({
  month: monthSchema,
  categoryId: z.string().min(1).optional(),
})

export default defineEventHandler(async (event) => {
  const viewer = await getStewardshipViewer(event)
  if (!viewer.canView) throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  const { month, categoryId } = await getValidatedQuery(event, querySchema.parse)
  return { occurrences: upcoming(`${month}-01`, monthEnd(month), { categoryId }).map(o => maskRecurring(o, viewer.canManage)) }
})
