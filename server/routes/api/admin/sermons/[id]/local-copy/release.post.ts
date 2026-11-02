// Keeps a message only on the church video host: removes the church server's copy once the host
// is shown to hold the same original. See server/lib/local-release.ts.
import { bunnyConfig } from '../../../../../../lib/bunny.ts'
import { releaseLocalCopy } from '../../../../../../lib/local-release.ts'
import { localVideoFolder } from '../../../../../../lib/local-video.ts'
import { loadSermon, presentAdminSermon } from '../../../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['delete'] })
  const id = getRouterParam(event, 'id')!
  const config = bunnyConfig()
  const folder = localVideoFolder()
  if (!config) throw createError({ statusCode: 503, statusMessage: 'No video host is connected to this site yet.' })
  if (!folder) throw createError({ statusCode: 409, statusMessage: 'No folder for local copies is set up on this site.' })
  await releaseLocalCopy(id, { config, folder, userId: session.user.id })
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
