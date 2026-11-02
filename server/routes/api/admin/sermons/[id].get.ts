// One message, as the office sees it.
import { loadSermon, presentAdminSermon } from '../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { sermon: ['update'] })
  const sermon = loadSermon({ id: getRouterParam(event, 'id')! })
  if (!sermon) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  return { sermon: presentAdminSermon(sermon) }
})
