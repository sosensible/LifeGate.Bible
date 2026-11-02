// Whether this site is connected to a video host, so the form knows to offer an upload.
import { bunnyConfig } from '../../../../lib/bunny.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { sermon: ['update'] })
  return { enabled: bunnyConfig() !== null }
})
