// Tries a failed move again. Videos already copied and checked are not copied again.
import { kickFolderMove, loadMove, presentMove, retryFolderMove } from '../../../../lib/folder-move.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { integrations: ['manage'] })
  retryFolderMove()
  kickFolderMove()
  return { move: presentMove(loadMove()) }
})
