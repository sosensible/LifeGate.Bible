// A teacher chooses who may see a message they taught: anyone (if the office allows it),
// members only, or no one. It can only narrow what the office has set, never widen it,
// and the pastor and administrators have their own pauses that this does not touch.
import { z } from 'zod'
import { TEACHER_SHARES } from '../../../../../../shared/sermon-sharing.ts'
import { recordAudit } from '../../../../../lib/audit.ts'
import { db } from '../../../../../lib/db.ts'
import { loadSermon, presentAdminSermon, setTeacherShare } from '../../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const id = getRouterParam(event, 'id') ?? ''
  const { share } = await readValidatedBody(event, z.object({ share: z.enum(TEACHER_SHARES) }).parse)

  db.transaction((tx) => {
    if (setTeacherShare(tx, id, session.user.id, share)) {
      recordAudit(tx, { actorUserId: session.user.id, action: 'sermon.share', entityType: 'sermon', entityId: id, note: `Teacher set it to ${share}` })
    }
  })
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
