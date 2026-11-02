// Scheduled check of hosted videos still being prepared (see scheduledTasks in
// nuxt.config.ts). Does nothing until the video host is connected.
import { bunnyConfig } from '../../lib/bunny.ts'
import { refreshProcessingVideos } from '../../lib/hosted-video.ts'

export default defineTask({
  meta: {
    name: 'hosted-video:refresh',
    description: 'Check hosted videos that were still being prepared, and publish messages waiting on them',
  },
  async run() {
    const config = bunnyConfig()
    if (!config) return { result: 'skipped: no video host is connected' }
    const { checked, changed } = await refreshProcessingVideos(config)
    return { result: `checked ${checked}, finished ${changed}` }
  },
})
