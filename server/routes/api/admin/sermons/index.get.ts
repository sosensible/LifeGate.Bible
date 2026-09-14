import { loadSermons, presentAdminSermon } from '../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { sermon: ['update'] })
  return { sermons: loadSermons().map(presentAdminSermon) }
})
