// The handler behind the church server's video upload address (server/lib/local-files.ts).
// Auto-imported, so the two routes that point at it (the address itself, which starts an
// upload, and everything under it, which continues one) share one.
import type { H3Event } from 'h3'
import { auth } from '../lib/auth.ts'
import { uploadServer } from '../lib/local-files.ts'
import { checkFolder, localVideoFolder } from '../lib/local-video.ts'
import { bunnyConfig } from '../lib/bunny.ts'
import { refuseDuringMove } from '../lib/folder-move.ts'
import { kickPushes, queueSends } from '../lib/video-push.ts'
import { youtubeConfig, youtubeStatus } from '../lib/youtube.ts'

// The upload server asks who is signed in from each request's own cookie.
const whoIs = async (req: Request) => (await auth.api.getSession({ headers: req.headers }))?.user.id ?? null

// Once a video is filed, it is sent on in the background: to the church video host if one is
// connected, and to YouTube if the volunteer asked and the channel is connected.
const afterStored = (sermonId: string, sha256: string, wishes: { youtube: boolean }) => {
  queueSends(sermonId, sha256, wishes, { host: bunnyConfig() !== null, youtube: youtubeConfig() !== null && youtubeStatus().connected })
  kickPushes()
}

// Needs the right to edit teaching, and a folder chosen on Church details that the server can write to.
export const handleLocalUpload = async (event: H3Event) => {
  await requirePermission(event, { sermon: ['update'] })
  refuseDuringMove()
  const folder = localVideoFolder()
  if (!folder || !checkFolder(folder).writable) {
    throw createError({ statusCode: 409, statusMessage: 'No folder for local copies is set up on this site.' })
  }
  await uploadServer(folder, whoIs, afterStored).handle(event.node.req, event.node.res)
}
