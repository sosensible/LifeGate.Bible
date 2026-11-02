// Removes the sermon from the site. A YouTube video stays on YouTube; a hosted copy is
// removed from the video host too, so it does not go on costing storage.
import { eq } from 'drizzle-orm'
import { sermons } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { bunnyConfig, deleteHostedVideo } from '../../../../lib/bunny.ts'
import { loadSermon } from '../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['delete'] })
  const id = getRouterParam(event, 'id')!
  const hostedVideoId = loadSermon({ id })?.hostedVideoId

  const deleted = db.transaction((tx) => {
    const row = tx.delete(sermons).where(eq(sermons.id, id)).returning({ id: sermons.id }).get()
    if (row) recordAudit(tx, { actorUserId: session.user.id, action: 'sermon.delete', entityType: 'sermon', entityId: id })
    return row
  })
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Message not found' })

  // The message is gone either way; a copy the host could not remove is only left costing.
  const config = bunnyConfig()
  if (hostedVideoId && config) await deleteHostedVideo(config, hostedVideoId).catch(error => console.warn('[hosted-video] could not remove', hostedVideoId, error))

  setResponseStatus(event, 204)
  return null
})
