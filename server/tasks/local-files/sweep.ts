// Daily clear-out of upload pieces nobody finished (see sweepIncoming in server/lib/local-files.ts).
import { sweepIncoming } from '../../lib/local-files.ts'
import { localVideoFolder } from '../../lib/local-video.ts'

export default defineTask({
  meta: {
    name: 'local-files:sweep',
    description: 'Remove abandoned upload pieces from the church server holding folder',
  },
  run() {
    const folder = localVideoFolder()
    if (!folder) return { result: 'skipped: no folder' }
    return { result: `removed ${sweepIncoming(folder)}` }
  },
})
