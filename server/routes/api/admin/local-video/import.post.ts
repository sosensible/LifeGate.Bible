// Files one video from the import folder as a teaching's copy on the church server, then sends it
// on to the video host (and YouTube, if asked) like any other upload.
import { z } from 'zod'
import { refuseDuringMove } from '../../../../lib/folder-move.ts'
import { checkFolder, localVideoFolder } from '../../../../lib/local-video.ts'
import { importFile } from '../../../../lib/video-import.ts'
import { sendStoredVideoOn } from '../../../../lib/video-push.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  refuseDuringMove()
  const body = await readValidatedBody(event, z.object({
    fileName: z.string().min(1).max(300),
    sermonId: z.string().min(1).max(100),
    replace: z.boolean().default(false),
    youtube: z.boolean().default(false),
  }).parse)
  const folder = localVideoFolder()
  if (!folder || !checkFolder(folder).writable) throw createError({ statusCode: 409, statusMessage: 'No folder for local copies is set up on this site.' })
  const stored = await importFile({ folder, fileName: body.fileName, sermonId: body.sermonId, replace: body.replace, userId: session.user.id })
  sendStoredVideoOn(body.sermonId, stored.sha256, { youtube: body.youtube })
  return { sermonId: body.sermonId, size: stored.size }
})
