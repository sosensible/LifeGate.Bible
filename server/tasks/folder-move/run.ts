// Carries on a folder move that was interrupted, for instance by the server restarting
// (see scheduledTasks in nuxt.config.ts). Does nothing when no move is running.
import { runFolderMove } from '../../lib/folder-move.ts'

export default defineTask({
  meta: {
    name: 'folder-move:run',
    description: 'Carry on moving the stored videos to another folder',
  },
  async run() {
    return { result: await runFolderMove() }
  },
})
