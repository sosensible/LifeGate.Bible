// Follow a channel, or mute it.
import { z } from 'zod'
import { db } from '../../../../lib/db.ts'
import { setFollowing } from '../../../../lib/notifications.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireNotifyViewer(event)
  const { following } = await readValidatedBody(event, z.object({ following: z.boolean() }).parse)
  db.transaction(tx => setFollowing(tx, viewer, getRouterParam(event, 'id') ?? '', following))
  return { following }
})
