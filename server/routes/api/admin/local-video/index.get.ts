// The folder for local copies of the teaching videos, whether the server can use it, and any move
// of the stored videos to another folder.
import { loadMove, presentMove } from '../../../../lib/folder-move.ts'
import { sermonFiles } from '../../../../database/schema/index.ts'
import { db } from '../../../../lib/db.ts'
import { localVideoStatus } from '../../../../lib/local-video.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { integrations: ['manage'] })
  setHeader(event, 'cache-control', 'no-store')
  const files = db.select({ size: sermonFiles.size }).from(sermonFiles).all()
  return { ...localVideoStatus(), stored: { count: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) }, move: presentMove(loadMove()) }
})
