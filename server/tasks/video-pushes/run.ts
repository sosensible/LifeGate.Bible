// Scheduled check for videos waiting to be sent to the church video host or YouTube, or due another try
// after a failure (see scheduledTasks in nuxt.config.ts). Does nothing until a host is connected
// and a folder is chosen.
import { bunnyConfig } from '../../lib/bunny.ts'
import { integrationValue } from '../../lib/integration-secrets.ts'
import { localVideoFolder } from '../../lib/local-video.ts'
import { runPushes } from '../../lib/video-push.ts'
import { youtubeConfig } from '../../lib/youtube.ts'

export default defineTask({
  meta: {
    name: 'video-pushes:run',
    description: 'Send stored videos on to the church video host and YouTube, and retry the ones that failed',
  },
  async run() {
    const config = bunnyConfig()
    const youtube = youtubeConfig()
    const folder = localVideoFolder()
    if (!folder || (!config && !youtube)) return { result: 'skipped: no folder, or nothing connected' }
    const { sent, failed, busy } = await runPushes({ config, youtube, cdnHost: integrationValue('bunny.cdnHost'), folder })
    return { result: busy ? 'skipped: already sending' : `sent ${sent}, failed ${failed}` }
  },
})
