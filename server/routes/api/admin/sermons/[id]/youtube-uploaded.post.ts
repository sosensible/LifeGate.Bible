// The browser reports the video it just uploaded. It is attached to the message only if it is
// really on the church's channel, so an id from anywhere else is refused.
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { sermons } from '../../../../../database/schema/index.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadSermon, presentAdminSermon } from '../../../../../lib/sermons.ts'
import { connectedAccess, videoIsOnChannel, YouTubeError, youtubeConfig } from '../../../../../lib/youtube.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  const id = getRouterParam(event, 'id')!
  if (!loadSermon({ id })) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  const { videoId } = await readValidatedBody(event, z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/) }).parse)

  const config = youtubeConfig()
  if (!config) throw createError({ statusCode: 503, statusMessage: 'YouTube is not set up on this site yet.' })
  try {
    const access = await connectedAccess(config)
    if (!access) throw createError({ statusCode: 409, statusMessage: 'The church’s YouTube channel is not connected.' })
    if (!await videoIsOnChannel(access.accessToken, videoId, access.channelId)) {
      throw createError({ statusCode: 400, statusMessage: 'That video is not on the church’s YouTube channel.' })
    }
  }
  catch (error) {
    if (error instanceof YouTubeError) throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    throw error
  }

  db.transaction((tx) => {
    tx.update(sermons).set({ videoProvider: 'youtube', videoId }).where(eq(sermons.id, id)).run()
    recordAudit(tx, { actorUserId: session.user.id, action: 'sermon.youtube', entityType: 'sermon', entityId: id, note: 'Posted to the church’s YouTube channel' })
  })
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
