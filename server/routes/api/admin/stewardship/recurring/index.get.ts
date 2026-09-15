import { loadRecurring, maskRecurring } from '../../../../../lib/recurring.ts'

export default defineEventHandler(async (event) => {
  const viewer = await getStewardshipViewer(event)
  if (!viewer.canView) throw createError({ statusCode: 403, statusMessage: 'Not allowed' })
  return { recurring: loadRecurring().map(item => maskRecurring(item, viewer.canManage)) }
})
