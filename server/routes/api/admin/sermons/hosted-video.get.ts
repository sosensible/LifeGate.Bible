// Whether this site is connected to a video host, and to the church's YouTube channel, so the
// form knows which uploads to offer.
import { bunnyConfig } from '../../../../lib/bunny.ts'
import { localVideoStatus } from '../../../../lib/local-video.ts'
import { youtubeStatus } from '../../../../lib/youtube.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { sermon: ['update'] })
  const { configured, connected, channelTitle } = youtubeStatus()
  return { enabled: bunnyConfig() !== null, youtube: { connected: configured && connected, channelTitle }, local: { enabled: localVideoStatus().writable } }
})
