// Checks whether a hosted copy that was still processing is ready, and returns the message.
import { bunnyConfig } from '../../../../../../lib/bunny.ts'
import { refreshHostedVideo } from '../../../../../../lib/hosted-video.ts'
import { loadSermon, presentAdminSermon } from '../../../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { sermon: ['update'] })
  const id = getRouterParam(event, 'id')!
  const config = bunnyConfig()
  if (config) await refreshHostedVideo(config, id)
  const sermon = loadSermon({ id })
  if (!sermon) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  return { sermon: presentAdminSermon(sermon) }
})
