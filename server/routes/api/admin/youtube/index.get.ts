// Whether the church's YouTube channel is connected, for the Church details page. Administrators only.
import { youtubeStatus } from '../../../../lib/youtube.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { integrations: ['manage'] })
  return youtubeStatus()
})
