// The videos waiting in the import folder, each with the best date found and the teachings it
// could belong to, for the import screen.
import { checkFolder, localVideoFolder } from '../../../../lib/local-video.ts'
import { scanImport } from '../../../../lib/video-import.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { sermon: ['update'] })
  setHeader(event, 'cache-control', 'no-store')
  const folder = localVideoFolder()
  if (!folder || !checkFolder(folder).writable) throw createError({ statusCode: 409, statusMessage: 'No folder for local copies is set up on this site.' })
  return scanImport(folder)
})
