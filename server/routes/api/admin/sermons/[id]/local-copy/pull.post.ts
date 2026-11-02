// Brings the original of a message's video in from the church video host, into the church
// server's folder, when the file is stored only there. It cannot bring back a video that is only on
// YouTube, which does not give the original back.
import { refuseDuringMove } from '../../../../../../lib/folder-move.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { bunnyConfig } from '../../../../../../lib/bunny.ts'
import { db } from '../../../../../../lib/db.ts'
import { integrationValue } from '../../../../../../lib/integration-secrets.ts'
import { loadLocalFile } from '../../../../../../lib/local-files.ts'
import { checkFolder, localVideoFolder } from '../../../../../../lib/local-video.ts'
import { loadSermon, presentAdminSermon } from '../../../../../../lib/sermons.ts'
import { kickPushes, queuePull } from '../../../../../../lib/video-push.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  refuseDuringMove()
  const id = getRouterParam(event, 'id')!
  const sermon = loadSermon({ id })
  if (!sermon) throw createError({ statusCode: 404, statusMessage: 'Message not found' })

  const folder = localVideoFolder()
  if (!folder || !checkFolder(folder).writable) throw createError({ statusCode: 409, statusMessage: 'No folder for local copies is set up on this site.' })
  if (!bunnyConfig()) throw createError({ statusCode: 503, statusMessage: 'No video host is connected to this site yet.' })
  if (!integrationValue('bunny.cdnHost')) throw createError({ statusCode: 409, statusMessage: 'Enter the video host’s delivery hostname on Church details first.' })
  if (loadLocalFile(id)) throw createError({ statusCode: 409, statusMessage: 'This message already has a copy on the church server.' })
  if (!sermon.hostedVideoId || sermon.hostedVideoState !== 'ready') throw createError({ statusCode: 409, statusMessage: 'There is no finished copy on the video host to bring in.' })

  queuePull(id)
  recordAudit(db, { actorUserId: session.user.id, action: 'sermon.local_copy', entityType: 'sermon', entityId: id, note: 'Asked to bring the video in from the video host' })
  kickPushes()
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
