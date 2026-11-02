// Starts moving every stored video to another folder. They are copied and checked first; the site
// switches over only when all are safely there. See server/lib/folder-move.ts.
import { z } from 'zod'
import { kickFolderMove, startFolderMove } from '../../../../lib/folder-move.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { integrations: ['manage'] })
  const { to } = await readValidatedBody(event, z.object({ to: z.string().trim().min(1).max(500) }).parse)
  const move = startFolderMove(to, session.user.id)
  if (move.state === 'running') kickFolderMove()
  return { move }
})
