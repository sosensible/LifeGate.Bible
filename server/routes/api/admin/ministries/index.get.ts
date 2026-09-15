import { loadMinistriesForAdmin } from '../../../../lib/ministries.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { ministry: ['update'] })
  return { ministries: loadMinistriesForAdmin() }
})
