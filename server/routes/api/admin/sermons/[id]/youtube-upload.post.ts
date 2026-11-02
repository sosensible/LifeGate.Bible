// Starts posting a message's video to the church's YouTube channel, as unlisted, and returns
// the address the browser sends the file to. The file never passes through this server.
import { z } from 'zod'
import { loadSermon } from '../../../../../lib/sermons.ts'
import { connectedAccess, siteOrigin, startUploadSession, YouTubeError, youtubeConfig } from '../../../../../lib/youtube.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { sermon: ['update'] })
  const sermon = loadSermon({ id: getRouterParam(event, 'id')! })
  if (!sermon) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  const file = await readValidatedBody(event, z.object({ size: z.number().int().positive(), type: z.string().max(100) }).parse)

  const config = youtubeConfig()
  if (!config) throw createError({ statusCode: 503, statusMessage: 'YouTube is not set up on this site yet.' })
  try {
    const access = await connectedAccess(config)
    if (!access) throw createError({ statusCode: 409, statusMessage: 'The church’s YouTube channel is not connected.' })
    const uploadUrl = await startUploadSession(access.accessToken, { title: sermon.title, description: sermon.description, privacy: 'unlisted' }, file, siteOrigin())
    return { uploadUrl }
  }
  catch (error) {
    if (error instanceof YouTubeError) throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    throw error
  }
})
