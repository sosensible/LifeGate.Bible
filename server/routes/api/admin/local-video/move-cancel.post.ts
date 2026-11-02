// Gives up a move that is running or has failed. The copies made in the new folder are removed;
// the old folder was never touched and stays in use.
import { cancelFolderMove } from '../../../../lib/folder-move.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { integrations: ['manage'] })
  cancelFolderMove()
  return { move: null }
})
